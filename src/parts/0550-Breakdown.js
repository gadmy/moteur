
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
          if(k && rec) { onclick = ` onclick="app.UI.openFiche('${k}', '${esc(String(rec.id))}')"`; titre = 'Ouvrir la fiche de ' + txt; }
          else if(link && link.masque) { titre = txt + ' — fiche rattachée, mais vous n\'avez pas accès à cette section.'; }
          else if(kind && canEdit) { onclick = ` onclick="app.Breakdown.resolveItem('${scene.id}', '${esc(cat)}', ${i})"`; titre = 'Aucune fiche — cliquez pour en créer une ou rattacher l\u2019élément'; }
          // La carte GARDE la classe .bd-tag : c'est elle que lit le trace de
          // liaison vers le scenario. v594 : simplifiee en ligne (photo + nom
          // seulement, la categorie est deja portee par le groupe).
          const etat = kind ? (link ? ' is-linked' : ' is-unlinked') : '';
          return `<div class="bd-fiche-row bd-tag${etat}" data-term="${esc(txt.toLowerCase())}"${extraAttr}${onclick} title="${esc(titre)}">
                      ${canEdit ? `<div class="compact-card-actions">
                          <button class="delete-btn" onclick="event.stopPropagation(); app.Breakdown.removeItem('${scene.id}', '${esc(cat)}', ${i}, event)" title="Retirer de cette scène">×</button>
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
                  ${g.titre ? `<div class="bd-cat-name" onclick="app.Breakdown.toggleGroup('${Utils.escape(g.titre).replace(/'/g, "\\'")}')"><span class="bd-cat-name-arrow">▾</span> ${Utils.escape(g.titre)} <span class="bd-cat-name-count">${g.entrees.length}</span></div>` : ''}
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
                      const prevId = state.activeBdSceneId;
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
                      const deleteResource = await UI.confirmModal({
                          title: '🗑️ Supprimer aussi la fiche Ressource ?',
                          message: `"${itemName}" n'apparaît plus dans aucune scène. Voulez-vous aussi supprimer la fiche Ressource associée ?`,
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

// ============ MOOD BOARD MODULE ============
const ColorWheel = {
    // ===================== ÉTAT & HARMONIES =====================
    canvas: null,
    ctx: null,
    size: 280,
    centerX: 140,
    centerY: 140,
    radius: 130,
    baseHue: 0,
    baseSaturation: 100,
    brightness: 50,
    harmony: 'analogous',
    colors: [],
    isDragging: false,
    onComplete: null,
    
    harmonies: {
        analogous: { name: 'Semblable', angles: [-30, -15, 0, 15, 30], saturations: null },
        shades: { name: 'Nuances', angles: [0, 0, 0, 0, 0], saturations: [100, 75, 50, 25, 10], lightnesses: [25, 35, 50, 65, 80] },
        complementary: { name: 'Complémentaire', angles: [0, 15, 180, 165, 195], saturations: [100, 60, 100, 70, 70] },
        splitComplementary: { name: 'Compl. partagées', angles: [0, 10, 150, 180, 210], saturations: null },
        triadic: { name: 'Triade', angles: [0, 120, 240, 10, 130], saturations: [100, 100, 100, 60, 60] },
        tetradic: { name: 'Carré', angles: [0, 90, 180, 270, 45], saturations: null },
        compound: { name: 'Composite', angles: [0, 30, 60, 180, 210], saturations: null },
        monochromatic: { name: 'Monochrome', angles: [0, 0, 0, 0, 0], saturations: [100, 80, 60, 40, 20] }
    },
    
    existingName: null,
    
    // ===================== OUVERTURE & ROUE =====================
    hexToHsl: (hex) => {
        // Convertir hex en RGB puis HSL
        let r = 0, g = 0, b = 0;
        if(hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if(hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if(max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    },
    
    open: (callback, existingColors = null, existingName = null, photoOpts = null) => {
        ColorWheel.onComplete = callback;
        ColorWheel.existingName = existingName;
        ColorWheel.photoOpts = photoOpts;
        
        // Si des couleurs existantes sont fournies, extraire la teinte de base
        if(existingColors && existingColors.length > 0) {
            const hsl = ColorWheel.hexToHsl(existingColors[0]);
            ColorWheel.baseHue = hsl.h;
            ColorWheel.baseSaturation = hsl.s;
            // La roue se dessine a une seule luminosite constante : une valeur
            // trop proche de 0 ou 100 la rend illisible (noire ou blanche),
            // meme si la couleur extraite elle-meme est tres sombre/claire.
            ColorWheel.brightness = Math.max(20, Math.min(80, hsl.l));
        } else {
            ColorWheel.baseHue = Math.random() * 360;
            ColorWheel.baseSaturation = 100;
            ColorWheel.brightness = 50;
        }
        ColorWheel.harmony = 'analogous';
        
        const modal = document.createElement('div');
        modal.className = 'color-wheel-modal';
        modal.id = 'colorWheelModal';
        modal.onclick = (e) => { if(e.target === modal) ColorWheel.close(); };
        
        const photoColumnHtml = photoOpts ? `
                    <div class="color-wheel-photo">
                        <div class="pe-photo-wrap" id="cwPhotoWrap" onmousemove="ColorWheel.magnifyPhoto(event)" onmouseleave="ColorWheel.resetPhotoZoom()">
                            <div class="pe-photo-inner" id="cwPhotoInner">
                                <img src="${photoOpts.photoSrc}" alt="" draggable="false">
                            </div>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-sec); margin-top:8px; text-align:center;">Glisse un point sur la photo pour ajuster sa couleur.</div>
                    </div>` : '';
        
        modal.innerHTML = `
            <div class="color-wheel-container"${photoOpts ? ' style="max-width:960px;"' : ''}>
                <div class="color-wheel-header">
                    <h3>🎨 ${photoOpts ? 'Extraire une palette' : 'Générateur de palette'}</h3>
                    <button class="color-wheel-close" onclick="ColorWheel.close()">✕</button>
                </div>
                <div class="color-wheel-body">
                    <div class="color-wheel-left">
                        <div class="color-wheel-canvas-wrap" id="colorWheelWrap">
                            <canvas id="colorWheelCanvas" width="280" height="280"></canvas>
                        </div>
                        <div class="harmony-selector">
                            <label>Type d'harmonie</label>
                            <select id="harmonySelect" onchange="ColorWheel.setHarmony(this.value)">
                                <option value="analogous">Semblable (Analogues)</option>
                                <option value="shades">Nuances</option>
                                <option value="complementary">Complémentaire</option>
                                <option value="splitComplementary">Complémentaires partagées</option>
                                <option value="triadic">Triade</option>
                                <option value="tetradic">Carré (Tétradique)</option>
                                <option value="compound">Composite</option>
                                <option value="monochromatic">Monochrome</option>
                            </select>
                        </div>
                        <div class="brightness-slider">
                            <label>Luminosité: <span id="brightnessValue">50</span>%</label>
                            <input type="range" id="brightnessRange" min="10" max="90" value="50" oninput="ColorWheel.setBrightness(this.value)">
                        </div>
                        ${photoOpts ? '<button class="cancel" style="margin-top:10px;width:100%;" onclick="ColorWheel.autoFromPhoto()">🔄 Auto</button>' : ''}
                    </div>
                    <div class="color-wheel-right">
                        <div class="generated-colors" id="generatedColors"></div>
                    </div>${photoColumnHtml}
                </div>
                <div class="color-wheel-actions">
                    <input type="text" id="paletteNameInput" placeholder="Nom de la palette..." data-tooltip="Nom de la palette..." style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-main);">
                    <button class="cancel" onclick="ColorWheel.close()">Annuler</button>
                    <button class="confirm" onclick="ColorWheel.addToBoard()">${(existingColors && !photoOpts) ? 'Modifier' : 'Ajouter au moodboard'}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Pré-remplir le nom si existant
        if(ColorWheel.existingName) {
            document.getElementById('paletteNameInput').value = ColorWheel.existingName;
        }
        
        ColorWheel.canvas = document.getElementById('colorWheelCanvas');
        ColorWheel.ctx = ColorWheel.canvas.getContext('2d');
        
        ColorWheel.drawWheel();
        // Cas extraction (v594) : partir des 5 couleurs extraites TELLES
        // QUELLES, pas de la formule d'harmonie qui n'en retiendrait qu'une
        // approximation a partir de la seule premiere teinte.
        if(photoOpts && existingColors && existingColors.length) {
            ColorWheel.colors = (photoOpts.initialPoints || []).map(p => ({ ...p }));
            ColorWheel.renderColors();
        } else {
            ColorWheel.generateColors();
        }
        ColorWheel.updateMarkers();
        if(photoOpts) {
            ColorWheel.renderPhotoMarkers();
            // Le contenu de la photo est en position absolue (pour le
            // panoramique) : sans hauteur fixee tout de suite, le cadre
            // s'effondrerait a 0px au repos.
            const wrap = document.getElementById('cwPhotoWrap');
            if(wrap && photoOpts.canvasW && photoOpts.canvasH) {
                wrap.style.height = (wrap.getBoundingClientRect().width * photoOpts.canvasH / photoOpts.canvasW) + 'px';
                wrap.dataset.heightLocked = '1';
            }
        }
        ColorWheel.setupEvents();
    },

    // Agrandit la photo autour du curseur, pour placer un point avec
    // precision — mais dans un cadre qui reste FIXE (overflow:hidden) : la
    // vue defile a l'interieur au lieu d'agrandir sur place et de deborder.
    _photoZoom: { fx: 0.5, fy: 0.5, S: 1, offX: 0, offY: 0, w: 0, h: 0 },
    _draggingMarker: false,

    // Fixe la hauteur du cadre une seule fois (a sa taille au repos) : sans
    // ca, agrandir le contenu a l'interieur ferait aussi grandir le cadre.
    _lockPhotoWrapHeight: () => {
        const wrap = document.getElementById('cwPhotoWrap');
        if(!wrap || wrap.dataset.heightLocked) return;
        const rect = wrap.getBoundingClientRect();
        if(rect.height > 0) { wrap.style.height = rect.height + 'px'; wrap.dataset.heightLocked = '1'; }
    },

    // Deplace/agrandit la photo pour que le point vise (fx,fy, fraction 0-1
    // de la photo NON zoomee) reste exactement sous le curseur, sans jamais
    // reveler de vide au-dela des bords — donc jamais deborder du cadre.
    _applyPhotoZoom: (fx, fy, S) => {
        const wrap = document.getElementById('cwPhotoWrap');
        const inner = document.getElementById('cwPhotoInner');
        if(!wrap || !inner) return;
        ColorWheel._lockPhotoWrapHeight();
        const rect = wrap.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        const offX = fx * w * (S - 1);
        const offY = fy * h * (S - 1);
        inner.style.width = (w * S) + 'px';
        inner.style.left = (-offX) + 'px';
        inner.style.top = (-offY) + 'px';
        ColorWheel._photoZoom = { fx, fy, S, offX, offY, w, h };
    },

    magnifyPhoto: (e) => {
        if(ColorWheel._draggingMarker) return; // le glisser gere son propre suivi
        const wrap = document.getElementById('cwPhotoWrap');
        if(!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        ColorWheel._applyPhotoZoom(fx, fy, 2.2);
    },
    resetPhotoZoom: () => {
        if(ColorWheel._draggingMarker) return;
        const inner = document.getElementById('cwPhotoInner');
        if(inner) { inner.style.width = '100%'; inner.style.left = '0'; inner.style.top = '0'; }
        ColorWheel._photoZoom = { fx: 0.5, fy: 0.5, S: 1, offX: 0, offY: 0, w: 0, h: 0 };
    },

    // Pose les points colores sur la photo, a la position d'ou vient chaque
    // couleur. Une couleur saisie a la main (pas de x/y connu) n'a pas de point.
    renderPhotoMarkers: () => {
        const inner = document.getElementById('cwPhotoInner');
        if(!inner || !ColorWheel.photoOpts) return;
        inner.querySelectorAll('.pe-marker').forEach(m => m.remove());
        const { canvasW, canvasH } = ColorWheel.photoOpts;
        ColorWheel.colors.forEach((c, i) => {
            if(c.x == null || c.y == null) return;
            const m = document.createElement('div');
            m.className = 'pe-marker';
            m.dataset.idx = i;
            m.style.left = (c.x / canvasW * 100) + '%';
            m.style.top = (c.y / canvasH * 100) + '%';
            m.style.background = c.hex;
            m.title = 'Glisser pour ajuster';
            m.addEventListener('mousedown', (ev) => ColorWheel._startPhotoMarkerDrag(ev, i));
            inner.appendChild(m);
        });
    },

    _startPhotoMarkerDrag: (e, i) => {
        e.preventDefault();
        e.stopPropagation();
        const wrap = document.getElementById('cwPhotoWrap');
        const inner = document.getElementById('cwPhotoInner');
        if(!wrap || !inner || !ColorWheel.photoOpts) return;
        ColorWheel._draggingMarker = true;
        const { canvasW, canvasH, sample, computePalette } = ColorWheel.photoOpts;

        const onMove = (ev) => {
            const rect = wrap.getBoundingClientRect();
            const dispX = ev.clientX - rect.left;
            const dispY = ev.clientY - rect.top;
            const z = ColorWheel._photoZoom;
            // Retrouve, avec le panoramique ACTUEL, le point de la photo
            // reellement sous le curseur (avant de faire suivre la loupe).
            let fx, fy;
            if(z && z.S && z.S !== 1 && z.w) {
                fx = (dispX + z.offX) / (z.w * z.S);
                fy = (dispY + z.offY) / (z.h * z.S);
            } else {
                fx = dispX / rect.width;
                fy = dispY / rect.height;
            }
            fx = Math.max(0, Math.min(1, fx));
            fy = Math.max(0, Math.min(1, fy));
            // La loupe recentre/defile sur ce point — c'est ce qui permet de
            // continuer a glisser meme quand on approche un bord.
            ColorWheel._applyPhotoZoom(fx, fy, 2.2);
            const x = fx * canvasW, y = fy * canvasH;
            const hex = sample(x, y);
            const hsl = ColorWheel.hexToHsl(hex);
            // Les 4 autres points se recalent sur l'harmonie en cours, dans sa
            // forme exacte, autour de la couleur qu'on est en train de deplacer.
            const lock = { idx: i, hue: hsl.h, sat: hsl.s, light: hsl.l, exact: { hex, x, y } };
            const pts = computePalette ? computePalette(ColorWheel.harmony, lock) : null;
            if(pts) {
                ColorWheel.colors = pts.map(p => ({ ...p }));
            } else {
                ColorWheel.colors[i] = { hue: hsl.h, saturation: Math.round(hsl.s), lightness: Math.round(hsl.l), hex, x, y };
            }
            ColorWheel.renderColors();
            ColorWheel.renderPhotoMarkers();
            ColorWheel.updateMarkers();
        };
        const onUp = () => {
            ColorWheel._draggingMarker = false;
            ColorWheel.resetPhotoZoom();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    // Rappelle l'extraction automatique depuis la photo (mode extraction
    // uniquement) : remplace les 5 couleurs et repositionne leurs points.
    autoFromPhoto: () => {
        if(!ColorWheel.photoOpts || !ColorWheel.photoOpts.computePalette) return;
        const pts = ColorWheel.photoOpts.computePalette(ColorWheel.harmony, null);
        if(!pts || !pts.length) return;
        ColorWheel.colors = pts.map(p => ({ ...p }));
        ColorWheel.renderColors();
        ColorWheel.updateMarkers();
        ColorWheel.renderPhotoMarkers();
    },
    
    close: () => {
        const modal = document.getElementById('colorWheelModal');
        if(modal) modal.remove();
        ColorWheel.photoOpts = null;
    },
    
    drawWheel: () => {
        const ctx = ColorWheel.ctx;
        const cx = ColorWheel.centerX;
        const cy = ColorWheel.centerY;
        const radius = ColorWheel.radius;
        
        ctx.clearRect(0, 0, ColorWheel.size, ColorWheel.size);
        
        for(let angle = 0; angle < 360; angle += 1) {
            for(let r = 0; r < radius; r += 1) {
                const hue = angle;
                const saturation = (r / radius) * 100;
                const lightness = ColorWheel.brightness;
                
                ctx.beginPath();
                ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                
                const rad = (angle - 90) * Math.PI / 180;
                const x = cx + r * Math.cos(rad);
                const y = cy + r * Math.sin(rad);
                
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    },
    
    setupEvents: () => {
        const wrap = document.getElementById('colorWheelWrap');
        
        wrap.addEventListener('mousedown', (e) => {
            ColorWheel.isDragging = true;
            // Mode photo : retenir quel point (parmi les 5) est le plus
            // proche du clic, pour l'ancrer lui — pas le point "principal"
            // par defaut — pendant tout le glisser.
            ColorWheel._wheelDragIdx = ColorWheel._nearestMarkerIdx(e);
            ColorWheel.handleDrag(e);
        });
        
        if(!ColorWheel._docBound) {
            ColorWheel._docBound = true;
            document.addEventListener('mousemove', (e) => {
                if(ColorWheel.isDragging) ColorWheel.handleDrag(e);
            });
            document.addEventListener('mouseup', () => {
                ColorWheel.isDragging = false;
            });
        }
    },

    // Point (parmi les 5 actuels) le plus proche d'une position d'ecran sur
    // la roue.
    _nearestMarkerIdx: (e) => {
        const rect = ColorWheel.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        let best = 0, bestDist = Infinity;
        ColorWheel.colors.forEach((c, i) => {
            const rad = (c.hue - 90) * Math.PI / 180;
            const dist = (c.saturation / 100) * ColorWheel.radius;
            const mx2 = ColorWheel.centerX + dist * Math.cos(rad);
            const my2 = ColorWheel.centerY + dist * Math.sin(rad);
            const d = Math.hypot(mx - mx2, my - my2);
            if(d < bestDist) { bestDist = d; best = i; }
        });
        return best;
    },
    
    handleDrag: (e) => {
        const rect = ColorWheel.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - ColorWheel.centerX;
        const y = e.clientY - rect.top - ColorWheel.centerY;
        
        let angle = Math.atan2(y, x) * 180 / Math.PI + 90;
        if(angle < 0) angle += 360;
        
        const distance = Math.sqrt(x * x + y * y);
        const saturation = Math.min(100, Math.max(10, (distance / ColorWheel.radius) * 100));
        
        // Mode photo : le point saisi ET les 4 autres restent ancres dans de
        // vraies couleurs de la photo, dans la forme EXACTE de l'harmonie en
        // cours (comme les coins d'un carre qui peut tourner/grossir mais
        // jamais se deformer).
        if(ColorWheel.photoOpts && ColorWheel.photoOpts.computePalette) {
            const idx = ColorWheel._wheelDragIdx != null ? ColorWheel._wheelDragIdx : 0;
            const current = ColorWheel.colors[idx];
            const lock = { idx, hue: angle, sat: saturation, light: current ? current.lightness : ColorWheel.brightness, exact: null };
            const pts = ColorWheel.photoOpts.computePalette(ColorWheel.harmony, lock);
            if(pts) {
                ColorWheel.colors = pts.map(p => ({ ...p }));
                ColorWheel.renderColors();
                ColorWheel.updateMarkers();
                ColorWheel.renderPhotoMarkers();
                return;
            }
        }
        
        ColorWheel.baseHue = angle;
        ColorWheel.baseSaturation = saturation;
        
        ColorWheel.generateColors();
        ColorWheel.updateMarkers();
    },
    
    setHarmony: (harmony) => {
        ColorWheel.harmony = harmony;
        ColorWheel.generateColors();
        ColorWheel.updateMarkers();
    },
    
    setBrightness: (value) => {
        ColorWheel.brightness = parseInt(value);
        document.getElementById('brightnessValue').textContent = value;
        ColorWheel.drawWheel();
        ColorWheel.generateColors();
        ColorWheel.updateMarkers();
    },
    
    // ===================== COULEURS & RENDU =====================
    generateColors: () => {
        const h = ColorWheel.harmony;
        const harmonyData = ColorWheel.harmonies[h];
        const baseHue = ColorWheel.baseHue;
        const baseSat = ColorWheel.baseSaturation;
        const light = ColorWheel.brightness;
        
        ColorWheel.colors = [];
        
        for(let i = 0; i < 5; i++) {
            let hue = (baseHue + harmonyData.angles[i] + 360) % 360;
            // Appliquer la saturation de base proportionnellement
            let sat;
            if(harmonyData.saturations) {
                sat = (harmonyData.saturations[i] / 100) * baseSat;
            } else {
                sat = baseSat;
            }
            let l = harmonyData.lightnesses ? harmonyData.lightnesses[i] : light;
            const hex = ColorWheel.hslToHex(hue, sat, l);
            const c = { hue: hue, saturation: Math.round(sat), lightness: l, hex: hex };
            // Mode extraction : replacer le point sur la photo, au pixel le
            // plus proche de cette nouvelle couleur — sinon il disparaitrait
            // a chaque changement d'harmonie/luminosite.
            if(ColorWheel.photoOpts && ColorWheel.photoOpts.findNearestPixel) {
                const p = ColorWheel.photoOpts.findNearestPixel(hex);
                c.x = p.x; c.y = p.y;
            }
            ColorWheel.colors.push(c);
        }
        
        ColorWheel.renderColors();
        if(ColorWheel.photoOpts) ColorWheel.renderPhotoMarkers();
    },
    
    hslToHex: (h, s, l) => {
        s /= 100;
        l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
    },
    
    hexToRgb: (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },
    
    renderColors: () => {
        const container = document.getElementById('generatedColors');
        if(!container) return;
        
        container.innerHTML = ColorWheel.colors.map((c, i) => {
            if(c.notFound) {
                return `
                    <div class="generated-color-item generated-color-missing" title="Aucune couleur assez proche dans la photo">
                        <div class="generated-color-swatch generated-color-swatch-empty"></div>
                        <div class="generated-color-info">
                            <div class="generated-color-missing-label">Introuvable dans la photo</div>
                        </div>
                    </div>
                `;
            }
            const rgb = ColorWheel.hexToRgb(c.hex);
            return `
                <div class="generated-color-item">
                    <div class="generated-color-swatch" style="background: ${c.hex}; cursor:pointer;" onclick="navigator.clipboard.writeText('${c.hex}'); Utils.toast('${c.hex} copié !', 'success');" title="Cliquer pour copier"></div>
                    <div class="generated-color-info">
                        <input class="generated-color-hex" type="text" value="${c.hex}" maxlength="7" spellcheck="false"
                            onclick="event.stopPropagation()" onchange="ColorWheel.setColorHex(${i}, this.value)">
                        <div class="generated-color-rgb">RGB(${rgb ? rgb.r : 0}, ${rgb ? rgb.g : 0}, ${rgb ? rgb.b : 0})</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Saisie manuelle d'un hex (en plus du choix sur la roue) : recalcule la
    // teinte/saturation/luminosité internes pour rester cohérent (marqueur,
    // luminosité affichée...).
    setColorHex: (i, val) => {
        let hex = String(val || '').trim();
        if(hex && hex[0] !== '#') hex = '#' + hex;
        if(!/^#[0-9A-Fa-f]{6}$/.test(hex)) { ColorWheel.renderColors(); return; }
        hex = hex.toUpperCase();
        const hsl = ColorWheel.hexToHsl(hex);

        // Mode photo : ancrer ce hex sur le pixel de la photo le plus proche,
        // puis faire suivre les 4 autres selon la forme de l'harmonie — meme
        // logique que le glisser sur la photo ou sur la roue.
        if(ColorWheel.photoOpts && ColorWheel.photoOpts.computePalette && ColorWheel.photoOpts.findNearestPixel) {
            const p = ColorWheel.photoOpts.findNearestPixel(hex);
            const lock = { idx: i, hue: hsl.h, sat: hsl.s, light: hsl.l, exact: { hex, x: p.x, y: p.y } };
            const pts = ColorWheel.photoOpts.computePalette(ColorWheel.harmony, lock);
            if(pts) {
                ColorWheel.colors = pts.map(pt => ({ ...pt }));
                ColorWheel.renderColors();
                ColorWheel.updateMarkers();
                ColorWheel.renderPhotoMarkers();
                return;
            }
        }

        const c = { hue: hsl.h, saturation: Math.round(hsl.s), lightness: Math.round(hsl.l), hex };
        if(ColorWheel.photoOpts && ColorWheel.photoOpts.findNearestPixel) {
            const p = ColorWheel.photoOpts.findNearestPixel(hex);
            c.x = p.x; c.y = p.y;
        }
        ColorWheel.colors[i] = c;
        ColorWheel.renderColors();
        ColorWheel.updateMarkers();
        if(ColorWheel.photoOpts) ColorWheel.renderPhotoMarkers();
    },
    
    updateMarkers: () => {
        const wrap = document.getElementById('colorWheelWrap');
        if(!wrap) return;
        
        wrap.querySelectorAll('.color-wheel-marker').forEach(m => m.remove());
        
        ColorWheel.colors.forEach((c, i) => {
            const marker = document.createElement('div');
            marker.className = 'color-wheel-marker' + (i === 0 ? ' main draggable' : '') + (c.notFound ? ' not-found' : '');
            
            const rad = (c.hue - 90) * Math.PI / 180;
            const dist = (c.saturation / 100) * ColorWheel.radius;
            const x = ColorWheel.centerX + dist * Math.cos(rad);
            const y = ColorWheel.centerY + dist * Math.sin(rad);
            
            marker.style.left = x + 'px';
            marker.style.top = y + 'px';
            marker.style.backgroundColor = c.notFound ? 'transparent' : c.hex;
            marker.title = c.notFound ? 'Aucune couleur assez proche dans la photo' : '';
            
            wrap.appendChild(marker);
        });
    },
    
    addToBoard: () => {
        const hexColors = ColorWheel.colors.filter(c => !c.notFound).map(c => c.hex);
        const nameInput = document.getElementById('paletteNameInput');
        const paletteName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : ColorWheel.harmonies[ColorWheel.harmony].name;
        
        if(!hexColors.length) { Utils.toast('Aucune couleur valide à ajouter.', 'warning'); return; }
        
        ColorWheel.close();
        
        if(ColorWheel.onComplete) {
            ColorWheel.onComplete(hexColors, paletteName);
        }
    }
};

const MoodBoard = {
    // ===================== ÉTAT =====================
    currentBoardId: null,
    selectedElementId: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    isDraggingElement: false,
    isResizingElement: false,
    resizeHandle: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    
    // ===================== INIT, CANVAS & VIEWPORT =====================
    init: () => {
        MoodBoard.renderBoardsList();
        MoodBoard.setupCanvasEvents();
        MoodBoard.updateEmptyState();
    },
    
    // 31 aout — LE VERROU DE LECTURE SEULE DU MOOD BOARD. La zone centrale
    // echappe entierement au verrou CSS : elle ne fonctionne pas au clic mais a
    // la SOURIS (mousedown / deplacement / poignees), et rien de tout cela ne
    // porte d'attribut onclick. On pouvait donc deplacer, redimensionner,
    // tourner, editer le texte et ouvrir le clic droit sur un onglet en 👁️.
    // Une seule reponse, interrogee par tous les points d'entree.
    canWrite: () => {
        if(typeof Permissions === 'undefined' || !Permissions.canEdit) return true;
        if(state.currentRole === 'viewer') return false;
        return Permissions.canEdit('moodboard');
    },
    
    // Initialiser les événements du canvas
    setupCanvasEvents: () => {
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        const canvas = document.getElementById('moodboardCanvas');
        if(!wrapper || !canvas) return;
        
        // Clic sur la vignette : amener ce point au centre. Ecouteur pose en
        // JS (voir le commentaire de minimapGoTo) et une seule fois, d'ou le
        // drapeau : setupCanvasEvents peut etre rappelee.
        const vignette = document.getElementById('moodboardMinimapContent');
        if(vignette && !vignette.dataset.bound) {
            vignette.dataset.bound = '1';
            vignette.addEventListener('click', (e) => MoodBoard.minimapGoTo(e));
        }
        
        // Menu radial au clic droit
        wrapper.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // Le clic droit n'ouvre QUE des commandes d'ecriture (ajouter,
            // dupliquer, supprimer, modifier le texte) : rien a montrer en
            // lecture seule.
            if(!MoodBoard.canWrite()) return;
            const board = MoodBoard.getCurrentBoard();
            if(!board) return;
            
            // Position du clic relative au canvas
            const rect = canvas.getBoundingClientRect();
            MoodBoard.contextX = (e.clientX - rect.left - MoodBoard.panX) / MoodBoard.zoom;
            MoodBoard.contextY = (e.clientY - rect.top - MoodBoard.panY) / MoodBoard.zoom;
            
            // Vérifier si on clique sur un élément
            const clickedElement = e.target.closest('.moodboard-element');
            if(clickedElement) {
                const el = board.elements.find(o => o.id === clickedElement.dataset.id);
                if(!el || !MoodBoard._canInteract(board, el)) return;
                MoodBoard.showElementContextMenu(e.clientX, e.clientY, clickedElement.dataset.id);
            } else {
                MoodBoard.showRadialMenu(e.clientX, e.clientY);
            }
        });
        
        // Pan avec clic milieu ou espace + clic
        wrapper.addEventListener('mousedown', (e) => {
            if(e.target === canvas || e.target === wrapper) {
                if(e.button === 1 || (e.button === 0 && e.target === canvas)) {
                    MoodBoard.isPanning = true;
                    MoodBoard.panStartX = e.clientX - MoodBoard.panX;
                    MoodBoard.panStartY = e.clientY - MoodBoard.panY;
                    canvas.classList.add('dragging');
                    e.preventDefault();
                }
                // Désélectionner si clic sur canvas vide
                if(e.target === canvas) {
                    MoodBoard.selectElement(null);
                }
            }
        });
        
        wrapper.addEventListener('mousemove', (e) => {
            if(MoodBoard.isPanning) {
                MoodBoard.panX = e.clientX - MoodBoard.panStartX;
                MoodBoard.panY = e.clientY - MoodBoard.panStartY;
                MoodBoard.updateCanvasTransform();
            }
        });
        
        wrapper.addEventListener('mouseup', () => {
            MoodBoard.isPanning = false;
            canvas.classList.remove('dragging');
        });
        
        wrapper.addEventListener('mouseleave', () => {
            MoodBoard.isPanning = false;
            canvas.classList.remove('dragging');
        });
        
        // Zoom avec molette — centre sur le curseur, pas sur le coin de la planche
        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.max(0.1, Math.min(3, MoodBoard.zoom + delta));
            if(newZoom === MoodBoard.zoom) return;
            const rect = wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            // Point de la planche actuellement sous le curseur (avant le zoom).
            const cx = (mouseX - MoodBoard.panX) / MoodBoard.zoom;
            const cy = (mouseY - MoodBoard.panY) / MoodBoard.zoom;
            // Repositionner pour que ce meme point reste sous le curseur.
            MoodBoard.panX = mouseX - cx * newZoom;
            MoodBoard.panY = mouseY - cy * newZoom;
            MoodBoard.zoom = newZoom;
            MoodBoard.updateCanvasTransform();
            MoodBoard.updateZoomDisplay();
        });
        
        // Drag & drop fichiers
        wrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            wrapper.style.background = 'rgba(59, 130, 246, 0.1)';
        });
        
        wrapper.addEventListener('dragleave', () => {
            wrapper.style.background = '';
        });
        
        wrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            wrapper.style.background = '';
            if(!MoodBoard.canWrite()) return;
            const files = e.dataTransfer.files;
            if(files.length > 0) {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) / MoodBoard.zoom;
                const y = (e.clientY - rect.top) / MoodBoard.zoom;
                Array.from(files).forEach((file, i) => {
                    if(file.type.startsWith('image/')) {
                        MoodBoard.addImageFromFile(file, x + i * 20, y + i * 20);
                    }
                });
            }
        });
    },
    
    updateCanvasTransform: () => {
        const canvas = document.getElementById('moodboardCanvas');
        if(canvas) {
            canvas.style.transform = `translate(${MoodBoard.panX}px, ${MoodBoard.panY}px) scale(${MoodBoard.zoom})`;
        }
        MoodBoard.updateMinimap();
    },
    
    updateZoomDisplay: () => {
        const display = document.getElementById('moodboardZoomLevel');
        if(display) {
            display.textContent = Math.round(MoodBoard.zoom * 100) + '%';
        }
    },
    
    zoomIn: () => {
        MoodBoard.zoom = Math.min(3, MoodBoard.zoom + 0.1);
        MoodBoard.updateCanvasTransform();
        MoodBoard.updateZoomDisplay();
    },
    
    zoomOut: () => {
        MoodBoard.zoom = Math.max(0.1, MoodBoard.zoom - 0.1);
        MoodBoard.updateCanvasTransform();
        MoodBoard.updateZoomDisplay();
    },
    
    zoomReset: () => {
        MoodBoard.zoom = 1;
        MoodBoard.panX = 0;
        MoodBoard.panY = 0;
        MoodBoard.updateCanvasTransform();
        MoodBoard.updateZoomDisplay();
    },
    
    // ===== MINIMAP (1er septembre) =====
    // Elle existait en HTML et en CSS depuis le debut, mais son unique
    // fonction etait un TODO vide : on voyait un rectangle blanc dans le coin,
    // qui ne montrait jamais rien. Deux fonctions plutot qu'une, parce que les
    // deux besoins n'ont pas le meme cout :
    //   - renderMinimap() redessine les vignettes. Appelee quand le CONTENU
    //     change (rendu de la planche, fin d'un deplacement).
    //   - updateMinimap() ne fait que deplacer le cadre bleu. Appelee a chaque
    //     mouvement de souris pendant un deplacement de la planche : y
    //     reconstruire tout le HTML aurait rame sur une planche chargee.

    // Geometrie commune : ou et a quelle echelle la planche tient dans la
    // vignette. Renvoie null si l'ecran n'est pas la ou s'il n'y a pas de
    // planche ouverte.
    minimapGeometry: () => {
        const box = document.getElementById('moodboardMinimap');
        const board = MoodBoard.getCurrentBoard();
        if(!box || !board) return null;
        const bw = box.clientWidth, bh = box.clientHeight;
        if(!bw || !bh) return null;
        const dims = MoodBoard.FORMATS[board.format || 'free'] || MoodBoard.FORMATS['free'];
        const s = Math.min(bw / dims.w, bh / dims.h);
        return { board, dims, s, bw, bh, pw: dims.w * s, ph: dims.h * s,
                 ox: (bw - dims.w * s) / 2, oy: (bh - dims.h * s) / 2 };
    },

    renderMinimap: () => {
        const content = document.getElementById('moodboardMinimapContent');
        if(!content) return;
        const g = MoodBoard.minimapGeometry();

        // La page et le message d'attente sont crees une fois puis reutilises.
        // On ne touche PAS a content.innerHTML : le cadre bleu est un enfant de
        // content, le reecrire l'effacerait a chaque rendu.
        let page = document.getElementById('moodboardMinimapPage');
        if(!page) {
            page = document.createElement('div');
            page.id = 'moodboardMinimapPage';
            page.className = 'moodboard-minimap-page';
            content.insertBefore(page, content.firstChild);
        }
        let vide = document.getElementById('moodboardMinimapEmpty');
        if(!vide) {
            vide = document.createElement('div');
            vide.id = 'moodboardMinimapEmpty';
            vide.className = 'moodboard-minimap-empty';
            vide.textContent = 'Planche vide';
            content.appendChild(vide);
        }

        if(!g) { page.style.display = 'none'; vide.style.display = 'none'; return; }

        page.style.display = 'block';
        page.style.left = g.ox + 'px';
        page.style.top = g.oy + 'px';
        page.style.width = g.pw + 'px';
        page.style.height = g.ph + 'px';

        const elements = g.board.elements || [];
        vide.style.display = elements.length ? 'none' : 'flex';

        page.innerHTML = elements.map(el => {
            const x = (el.x || 0) * g.s, y = (el.y || 0) * g.s;
            // Plancher a 2 px : sous cette taille une vignette disparait, et
            // un element invisible sur la carte revient a ne pas l'avoir mis.
            const w = Math.max(2, (el.width || 0) * g.s);
            const h = Math.max(2, (el.height || 0) * g.s);
            let fond = 'background:#9ca3af;';
            if(el.type === 'image' || el.type === 'drawing') {
                // Une source contenant guillemet ou parenthese casserait le
                // url() de la feuille de style : dans ce cas on retombe sur un
                // aplat gris plutot que d'ecrire du CSS invalide.
                const src = String(el.src || '');
                fond = /["'()]/.test(src) || !src
                    ? 'background:#9ca3af;'
                    : `background-image:url(${Utils.escape(src)});background-color:#e5e7eb;`;
            } else if(el.type === 'palette') {
                const cols = (el.colors || ['#9ca3af']).filter(x => /^#[0-9a-fA-F]{3,8}$/.test(String(x)));
                fond = cols.length
                    ? `background:linear-gradient(90deg, ${cols.map((cc, i) => `${cc} ${Math.round(i * 100 / cols.length)}%, ${cc} ${Math.round((i + 1) * 100 / cols.length)}%`).join(', ')});`
                    : 'background:#9ca3af;';
            } else if(el.type === 'shape') {
                const col = String(el.color || '#374151');
                fond = /^#[0-9a-fA-F]{3,8}$/.test(col) ? `background:${col};` : 'background:#374151;';
            } else if(el.type === 'text') {
                fond = 'background:#d1d5db;';
            }
            const sel = el.id === MoodBoard.selectedElementId ? ' is-selected' : '';
            const rot = el.rotation ? `transform:rotate(${parseFloat(el.rotation) || 0}deg);` : '';
            return `<div class="moodboard-minimap-el${sel}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${fond}${rot}"></div>`;
        }).join('');

        MoodBoard.updateMinimap();
    },

    updateMinimap: () => {
        const viewport = document.getElementById('moodboardMinimapViewport');
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        if(!viewport || !wrapper) return;
        const g = MoodBoard.minimapGeometry();
        if(!g) { viewport.style.display = 'none'; return; }
        viewport.style.display = 'block';

        // Le canvas est pose en haut a gauche du wrapper puis transforme par
        // translate(panX, panY) scale(zoom), origine 0 0. Un point (cx, cy) de
        // la planche s'affiche donc en (panX + cx*zoom, panY + cy*zoom). La
        // zone visible va de 0 a la largeur du wrapper : on inverse.
        const z = MoodBoard.zoom || 1;
        const vx = -(MoodBoard.panX || 0) / z;
        const vy = -(MoodBoard.panY || 0) / z;
        const vw = wrapper.clientWidth / z;
        const vh = wrapper.clientHeight / z;

        viewport.style.left = (g.ox + vx * g.s) + 'px';
        viewport.style.top = (g.oy + vy * g.s) + 'px';
        viewport.style.width = Math.max(4, vw * g.s) + 'px';
        viewport.style.height = Math.max(4, vh * g.s) + 'px';
    },

    // Clic sur la vignette : on amene ce point au centre de l'ecran. C'est une
    // NAVIGATION, pas une modification — elle reste donc ouverte aux lecteurs.
    // L'ecouteur est pose en JS et non en attribut onclick : la regle de
    // lecture seule ne vise que les attributs, un onclick ici aurait rendu la
    // vignette morte pour qui n'a que le droit de regarder.
    minimapGoTo: (e) => {
        const content = document.getElementById('moodboardMinimapContent');
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        const g = MoodBoard.minimapGeometry();
        if(!content || !wrapper || !g) return;
        const r = content.getBoundingClientRect();
        const cx = (e.clientX - r.left - g.ox) / g.s;
        const cy = (e.clientY - r.top - g.oy) / g.s;
        const z = MoodBoard.zoom || 1;
        MoodBoard.panX = wrapper.clientWidth / 2 - cx * z;
        MoodBoard.panY = wrapper.clientHeight / 2 - cy * z;
        MoodBoard.updateCanvasTransform();
    },
    
    updateEmptyState: () => {
        const empty = document.getElementById('moodboardEmpty');
        const canvas = document.getElementById('moodboardCanvas');
        const boards = state.data.moodboards || [];
        
        if(boards.length === 0) {
            if(empty) empty.style.display = 'flex';
            if(canvas) canvas.style.display = 'none';
        } else {
            if(empty) empty.style.display = 'none';
            if(canvas) canvas.style.display = 'block';
        }
    },
    
    // ===== GESTION DES PLANCHES =====
    createBoard: async () => {
        if(!MoodBoard.canWrite()) { Utils.toast("Vous n'avez pas les droits de modification sur le mood board.", 'error'); return; }
        // Créer une modale personnalisée avec nom + liaison
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'confirm-modal-overlay';
            modal.onclick = (e) => { if(e.target === modal) { modal.remove(); resolve(); } };
            
            // Construire les options de liaison par catégories
            let linkOptionsHtml = '<option value="project">🎬 Projet entier</option>';
            
            // Scènes
            if((state.data.scenes || []).length > 0) {
                linkOptionsHtml += '<optgroup label="📄 Scènes">';
                (state.data.scenes || []).forEach((scene, i) => {
                    linkOptionsHtml += `<option value="scene_${scene.id}">Scène ${i+1}: ${Utils.escape(scene.title || 'Sans titre')}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Personnages
            if((state.data.characters || []).length > 0) {
                linkOptionsHtml += '<optgroup label="👤 Personnages">';
                (state.data.characters || []).forEach(char => {
                    linkOptionsHtml += `<option value="character_${char.id}">${Utils.escape(char.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Comédiens
            if((state.data.actors || []).length > 0) {
                linkOptionsHtml += '<optgroup label="🎭 Comédiens">';
                (state.data.actors || []).forEach(actor => {
                    linkOptionsHtml += `<option value="actor_${actor.id}">${Utils.escape(actor.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Décors
            if((state.data.locations || []).length > 0) {
                linkOptionsHtml += '<optgroup label="📍 Décors">';
                (state.data.locations || []).forEach(loc => {
                    linkOptionsHtml += `<option value="location_${loc.id}">${Utils.escape(loc.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Ressources
            if((state.data.resources || []).length > 0) {
                linkOptionsHtml += '<optgroup label="📦 Ressources">';
                (state.data.resources || []).forEach(res => {
                    linkOptionsHtml += `<option value="resource_${res.id}">${Utils.escape(res.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            modal.innerHTML = `
                <div class="confirm-modal-box" style="max-width: 450px;">
                    <div class="confirm-modal-icon">🎨</div>
                    <div class="confirm-modal-title">Nouvelle planche</div>
                    <div style="text-align: left; margin: 15px 0;">
                        <label class="label-500">Nom de la planche :</label>
                        <input type="text" id="mbNewBoardName" class="n8-badge-12" value="Planche ${(state.data.moodboards || []).length + 1}" placeholder="Ex: Ambiance générale..." data-tooltip="Ex: Ambiance générale...">
                    </div>
                    <div style="text-align: left; margin: 15px 0;">
                        <label class="label-500">Lier à :</label>
                        <select id="mbNewBoardLink" class="n8-badge-12">
                            ${linkOptionsHtml}
                        </select>
                    </div>
                    <div class="confirm-modal-buttons">
                        <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                        <button class="confirm-modal-btn confirm" id="mbCreateBoardBtn">Créer</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const nameInput = modal.querySelector('#mbNewBoardName');
            const linkSelect = modal.querySelector('#mbNewBoardLink');
            const createBtn = modal.querySelector('#mbCreateBoardBtn');
            
            nameInput.focus();
            nameInput.select();
            
            nameInput.onkeydown = (e) => { if(e.key === 'Enter') createBtn.click(); if(e.key === 'Escape') modal.remove(); };
            
            createBtn.onclick = () => {
                const name = nameInput.value.trim();
                if(!name) {
                    Utils.toast('Entrez un nom pour la planche', 'warning');
                    return;
                }
                
                const linkValue = linkSelect.value;
                let linkedTo = { type: 'project' };
                if(linkValue !== 'project') {
                    const [type, ...idParts] = linkValue.split('_');
                    linkedTo = { type, id: idParts.join('_') };
                }
                
                if(!state.data.moodboards) state.data.moodboards = [];
                
                const board = {
                    id: 'mb_' + Utils.generateUniqueId(),
                    name: name,
                    format: 'a4-portrait',
                    linkedTo: linkedTo,
                    elements: [],
                    createdAt: Date.now(),
                    modifiedAt: Date.now()
                };
                
                state.data.moodboards.push(board);
                Store.save();
                
                modal.remove();
                
                MoodBoard.renderBoardsList();
                MoodBoard.selectBoard(board.id);
                MoodBoard.updateEmptyState();
                
                Utils.toast('Planche "' + name + '" créée', 'success');
                resolve(board);
            };
        });
    },
    
    renderBoardsList: () => {
        const container = document.getElementById('moodboardBoardsList');
        if(!container) return;
        
        const boards = state.data.moodboards || [];
        
        if(boards.length === 0) {
            container.innerHTML = '<span style="color: var(--text-sec); font-style: italic; padding: 5px;">Aucune planche</span>';
            return;
        }
        
        container.innerHTML = boards.map(board => {
            const isActive = board.id === MoodBoard.currentBoardId;
            const linkedIcon = board.linkedTo ? '🔗 ' : '';
            return `
                <div class="moodboard-board-tab ${isActive ? 'active' : ''}" data-fiche="board:${Utils.escape(String(board.id))}" onclick="app.MoodBoard.selectBoard('${board.id}')">
                    ${linkedIcon}${Utils.escape(board.name)}
                    <span class="tab-close" onclick="event.stopPropagation(); app.MoodBoard.deleteBoard('${board.id}')">×</span>
                </div>
            `;
        }).join('');
        
        // Bouton ajouter
        container.innerHTML += `
            <div class="moodboard-board-tab moodboard-board-add" onclick="app.MoodBoard.createBoard()" style="border-style: dashed;">
                + Nouvelle
            </div>
        `;
    },
    
    // La toile dit quelle planche elle montre : c'est elle qui portera le
    // cadenas et la mention « verrouillée » quand la planche est tenue par
    // quelqu'un d'autre. Repose apres chaque changement de planche.
    _marquerToile: () => {
        const toile = document.getElementById('moodboardCanvasWrapper');
        if(!toile) return;
        if(MoodBoard.currentBoardId) toile.dataset.fiche = 'board:' + MoodBoard.currentBoardId;
        else delete toile.dataset.fiche;
        try { if(typeof VerrouFin !== 'undefined') VerrouFin.marquerTout(); } catch(e) {}
    },

    selectBoard: (boardId) => {
        MoodBoard.currentBoardId = boardId;
        MoodBoard.selectedElementId = null;
        // v601 — VERROU PAR PLANCHE. Une planche n'est pas une carte dans une
        // liste : c'est une TOILE qu'on selectionne, et une seule est ouverte a
        // la fois. On y compose a la SOURIS, le curseur de texte ne s'y pose
        // jamais — le declencheur habituel ne verrait donc rien. Le verrou se
        // prend A LA PORTE, comme pour l'editeur de dessin : choisir une
        // planche, c'est venir y travailler. Et comme on n'en tient qu'un a la
        // fois, choisir la suivante rend la precedente sans rien de plus.
        // ON NE PREND RIEN EN LECTURE SEULE : consulter ne bloque personne.
        try {
            const peutEcrire = (typeof MoodBoard.canWrite !== 'function') || MoodBoard.canWrite();
            if(boardId && peutEcrire && typeof FicheLock !== 'undefined') FicheLock.prendre('board:' + boardId);
            MoodBoard._marquerToile();
        } catch(e) {}
        
        // S'assurer que la planche a un tableau elements
        const board = MoodBoard.getCurrentBoard();
        if(board && !board.elements) {
            board.elements = [];
            // 31 aout : ne pas enregistrer pour qui n'a pas le droit d'ecrire —
            // changer de planche est une consultation, elle ne doit rien pousser.
            const peut = (typeof Permissions === 'undefined' || !Permissions.canEdit) ? true : Permissions.canEdit('moodboard');
            if(peut) Store.save();
        }
        
        MoodBoard.renderBoardsList();
        MoodBoard.renderCanvas();
        
        // Mettre à jour le format
        if(board) {
            const formatSelect = document.getElementById('moodboardFormat');
            if(formatSelect) formatSelect.value = board.format || 'free';
        }
    },
    
    getCurrentBoard: () => {
        if(!MoodBoard.currentBoardId) return null;
        const board = (state.data.moodboards || []).find(b => b.id === MoodBoard.currentBoardId);
        if(board && !board.elements) {
            board.elements = [];
        }
        if(board && (!board.layers || board.layers.length === 0)) {
            board.layers = [{ id: 'layer_' + Date.now(), name: 'Calque 1', visible: true, locked: false }];
        }
        if(board && (!board.activeLayerId || !board.layers.some(l => l.id === board.activeLayerId))) {
            board.activeLayerId = board.layers[0].id;
        }
        return board;
    },
    
    // Calque où atterrissent les nouveaux éléments : le calque actif, ou le
    // premier calque si l'actif a été supprimé entre-temps.
    _activeLayerId: (board) => {
        if(board.layers.some(l => l.id === board.activeLayerId)) return board.activeLayerId;
        return board.layers[0].id;
    },
    
    // Calque d'un élément existant : son propre layerId, ou le premier calque
    // si l'élément vient d'avant l'introduction des calques.
    _elementLayerId: (board, el) => {
        if(el.layerId && board.layers.some(l => l.id === el.layerId)) return el.layerId;
        return board.layers[0].id;
    },
    
    _layerLocked: (board, el) => {
        const layerId = MoodBoard._elementLayerId(board, el);
        const layer = board.layers.find(l => l.id === layerId);
        return !!(layer && layer.locked);
    },
    
    // Un élément n'est manipulable (sélection comprise) que s'il est sur le
    // calque ACTIF et que ce calque n'est pas verrouillé. Le contenu des
    // autres calques reste visible mais intouchable.
    _canInteract: (board, el) => {
        return MoodBoard._elementLayerId(board, el) === MoodBoard._activeLayerId(board) && !MoodBoard._layerLocked(board, el);
    },
    
    addLayer: () => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const name = prompt('Nom du calque :', 'Calque ' + (board.layers.length + 1));
        if(!name) return;
        const layer = { id: 'layer_' + Date.now(), name: name.trim() || 'Calque ' + (board.layers.length + 1), visible: true, locked: false };
        board.layers.push(layer);
        board.activeLayerId = layer.id;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
        Utils.toast('Calque créé', 'success');
    },
    
    renameLayer: (layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        const name = prompt('Nom du calque :', layer.name);
        if(!name || !name.trim()) return;
        layer.name = name.trim();
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderLayersList();
    },
    
    deleteLayer: async (layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        if(board.layers.length <= 1) { Utils.toast('Il faut garder au moins un calque', 'warning'); return; }
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        const count = board.elements.filter(el => MoodBoard._elementLayerId(board, el) === layerId).length;
        const msg = count > 0
            ? `Ses ${count} élément${count > 1 ? 's' : ''} seront déplacés vers un autre calque.`
            : `Ce calque est vide.`;
        if(!await ConfirmModal.show({ title: `Supprimer le calque « ${layer.name} » ?`, message: msg, icon: '🗑️', confirmText: 'Supprimer' })) return;
        
        board.layers = board.layers.filter(l => l.id !== layerId);
        const fallbackId = board.layers[0].id;
        board.elements.forEach(el => { if(el.layerId === layerId) el.layerId = fallbackId; });
        if(board.activeLayerId === layerId) board.activeLayerId = fallbackId;
        
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
        Utils.toast('Calque supprimé', 'success');
    },
    
    toggleLayerVisibility: (layerId) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        layer.visible = layer.visible === false ? true : false;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    toggleLayerLock: (layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        layer.locked = !layer.locked;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderLayersList();
        Utils.toast(layer.locked ? 'Calque verrouillé' : 'Calque déverrouillé', 'info');
    },
    
    setActiveLayer: (layerId) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        board.activeLayerId = layerId;
        MoodBoard.selectedElementId = null;
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    // Déplace un élément vers un autre calque (menu de l'élément dans la liste).
    moveElementToLayer: (elementId, layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const el = board.elements.find(e => e.id === elementId);
        if(!el || !board.layers.some(l => l.id === layerId)) return;
        el.layerId = layerId;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    renderLayersList: () => {
        const container = document.getElementById('moodboardLayersList');
        if(!container) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) { container.innerHTML = ''; return; }
        
        // Du dessus vers le dessous : on affiche board.layers à l'envers.
        const rows = board.layers.slice().reverse().map(layer => {
            const isActive = layer.id === board.activeLayerId;
            const count = board.elements.filter(el => MoodBoard._elementLayerId(board, el) === layer.id).length;
            const hidden = layer.visible === false;
            return `
                <div class="moodboard-layer-item ${isActive ? 'selected' : ''}" draggable="true"
                     onclick="app.MoodBoard.setActiveLayer('${layer.id}')"
                     ondragstart="app.MoodBoard._layerDragStart(event, '${layer.id}')"
                     ondragover="app.MoodBoard._layerDragOver(event)"
                     ondragleave="app.MoodBoard._layerDragLeave(event)"
                     ondrop="app.MoodBoard._layerDrop(event, '${layer.id}')"
                     ondragend="app.MoodBoard._layerDragEnd(event)">
                    <span class="ml-handle" title="Glisser pour réordonner">⋮⋮</span>
                    <button class="ml-eye" onclick="event.stopPropagation(); app.MoodBoard.toggleLayerVisibility('${layer.id}')" title="${hidden ? 'Afficher' : 'Masquer'}">${hidden ? '🙈' : '👁️'}</button>
                    <button class="ml-lock" onclick="event.stopPropagation(); app.MoodBoard.toggleLayerLock('${layer.id}')" title="${layer.locked ? 'Déverrouiller' : 'Verrouiller'}">${layer.locked ? '🔒' : '🔓'}</button>
                    <div class="ml-name" ondblclick="event.stopPropagation(); app.MoodBoard.renameLayer('${layer.id}')" title="Double-clic pour renommer">${Utils.escape(layer.name)}</div>
                    <div class="ml-count">${count}</div>
                    <button class="ml-delete" onclick="event.stopPropagation(); app.MoodBoard.deleteLayer('${layer.id}')" title="Supprimer">🗑️</button>
                </div>`;
        }).join('');
        container.innerHTML = rows;
    },
    
    // ===== Glisser-déposer pour réordonner les calques (remplace les boutons
    // monter/descendre). L'ordre visuel est inversé par rapport au stockage
    // (haut de liste = premier plan = fin du tableau board.layers), mais on
    // travaille par identifiant donc ça n'a pas d'importance ici. =====
    _dragLayerId: null,
    _layerDragStart: (e, layerId) => {
        MoodBoard._dragLayerId = layerId;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', layerId); } catch(err) {}
        e.currentTarget.style.opacity = '0.5';
    },
    _layerDragOver: (e) => {
        if(!MoodBoard._dragLayerId) return;
        e.preventDefault();
        e.currentTarget.style.borderTop = '2px solid var(--primary)';
    },
    _layerDragLeave: (e) => {
        e.currentTarget.style.borderTop = '';
    },
    _layerDrop: (e, targetLayerId) => {
        e.preventDefault();
        e.currentTarget.style.borderTop = '';
        const draggedId = MoodBoard._dragLayerId;
        MoodBoard._dragLayerId = null;
        if(!draggedId || draggedId === targetLayerId) return;
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layers = board.layers;
        const fromIdx = layers.findIndex(l => l.id === draggedId);
        const toIdx = layers.findIndex(l => l.id === targetLayerId);
        if(fromIdx === -1 || toIdx === -1) return;
        const [moved] = layers.splice(fromIdx, 1);
        layers.splice(toIdx, 0, moved);
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    _layerDragEnd: (e) => {
        e.currentTarget.style.opacity = '';
        MoodBoard._dragLayerId = null;
    },
    
    deleteBoard: async (boardId) => {
        if(!MoodBoard.canWrite()) { Utils.toast("Vous n'avez pas les droits de modification sur le mood board.", 'error'); return; }
        const board = (state.data.moodboards || []).find(b => b.id === boardId);
        if(!board) return;
        
        const confirmed = await ConfirmModal.show({
            title: 'Supprimer la planche ?',
            message: `Voulez-vous vraiment supprimer "${Utils.escape(board.name)}" et tous ses éléments ?`,
            type: 'danger',
            confirmText: 'Supprimer'
        });
        
        if(!confirmed) return;
        
        state.data.moodboards = state.data.moodboards.filter(b => b.id !== boardId);
        
        if(MoodBoard.currentBoardId === boardId) {
            MoodBoard.currentBoardId = state.data.moodboards.length > 0 ? state.data.moodboards[0].id : null;
        }
        
        Store.save();
        MoodBoard.renderBoardsList();
        MoodBoard.renderCanvas();
        MoodBoard.updateEmptyState();
        
        Utils.toast('Planche supprimée', 'success');
    },
    
    FORMATS: {
        'free':         { w: 5000, h: 5000 },
        'a4-landscape': { w: 1190, h: 842 },
        'a4-portrait':  { w: 842,  h: 1190 },
        'a3-landscape': { w: 1684, h: 1190 },
        'a3-portrait':  { w: 1190, h: 1684 },
        'a2-landscape': { w: 2384, h: 1684 },
        'a2-portrait':  { w: 1684, h: 2384 },
        'a0-landscape': { w: 4768, h: 3370 },
        'a0-portrait':  { w: 3370, h: 4768 }
    },
    
    applyCanvasFormat: (canvas, format) => {
        if(!canvas) return;
        canvas.className = 'moodboard-canvas format-' + (format || 'a4-portrait');
        const d = MoodBoard.FORMATS[format] || MoodBoard.FORMATS['a4-portrait'];
        canvas.style.width = d.w + 'px';
        canvas.style.height = d.h + 'px';
    },
    
    changeFormat: (format) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        board.format = format;
        board.modifiedAt = Date.now();
        Store.save();
        
        // Mettre à jour la classe + dimensions du canvas
        MoodBoard.applyCanvasFormat(document.getElementById('moodboardCanvas'), format);
        // Le format commande l'echelle de la vignette : A4 portrait et A0
        // paysage ne se reduisent pas de la meme facon.
        MoodBoard.renderMinimap();
        
        // Synchroniser tous les selects de format
        const formatSelect = document.getElementById('moodboardFormat');
        if(formatSelect) formatSelect.value = format;
        
        // Mettre à jour le panneau info si ouvert
        MoodBoard.updateInfoPanel();
        
        // Recentrer la vue
        MoodBoard.zoomReset();
        
        Utils.toast('Format: ' + format.replace('-', ' ').toUpperCase(), 'success');
    },
    
    // ===== GESTION DES ÉLÉMENTS =====
    addImageFromFile: (file, x, y) => {
        const boardId = MoodBoard.currentBoardId;
        if(!boardId) {
            Utils.toast('Sélectionnez d\'abord une planche', 'warning');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const img = new Image();
            img.onload = () => {
                // Récupérer la planche au moment de l'ajout (pas avant)
                const board = MoodBoard.getCurrentBoard();
                if(!board) {
                    Utils.toast('Erreur: planche non trouvée', 'error');
                    return;
                }
                
                // Calculer les dimensions proportionnelles
                let width = img.width;
                let height = img.height;
                const maxSize = 400;
                
                if(width > maxSize || height > maxSize) {
                    if(width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }
                
                const element = {
                    id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: 'image',
                    x: x || 100,
                    y: y || 100,
                    width: Math.round(width),
                    height: Math.round(height),
                    src: dataUrl,
                    fileName: file.name,
                    linkedTo: null,
                    layerId: MoodBoard._activeLayerId(board),
                    createdAt: Date.now()
                };
                
                board.elements.push(element);
                board.modifiedAt = Date.now();
                Store.save();
                
                MoodBoard.renderCanvas();
                Utils.toast('Image ajoutée: ' + file.name, 'success');
            };
            img.onerror = () => {
                Utils.toast('Erreur de chargement de l\'image', 'error');
            };
            img.src = dataUrl;
        };
        reader.onerror = () => {
            Utils.toast('Erreur de lecture du fichier', 'error');
        };
        reader.readAsDataURL(file);
    },
    
    renderElementsList: () => {
        const container = document.getElementById('moodboardElementsList');
        const countEl = document.getElementById('moodboardElementsCount');
        if(!container) return;
        
        const board = MoodBoard.getCurrentBoard();
        if(!board || !board.elements || board.elements.length === 0) {
            container.innerHTML = '<p style="color: var(--text-sec); text-align: center; padding: 20px; font-size: 0.85rem;">Aucun élément<br><small>Clic droit sur le canvas pour ajouter</small></p>';
            if(countEl) countEl.textContent = '0';
            return;
        }
        
        if(countEl) countEl.textContent = board.elements.length;
        
        const typeIcons = {
            'image': '🖼️',
            'drawing': '✏️',
            'text': '📝',
            'palette': '🎨',
            'link': '🔗',
            'file': '📁'
        };
        
        const typeLabels = {
            'image': 'Image',
            'drawing': 'Dessin',
            'text': 'Texte',
            'palette': 'Palette',
            'link': 'Lien',
            'file': 'Fichier'
        };
        
        container.innerHTML = board.elements.map(el => {
            const isSelected = el.id === MoodBoard.selectedElementId;
            const icon = typeIcons[el.type] || '📄';
            const typeLabel = typeLabels[el.type] || el.type;
            
            let name = '';
            if(el.type === 'text') name = (el.content || '').substring(0, 25) + (el.content?.length > 25 ? '...' : '');
            else if(el.type === 'image' || el.type === 'file') name = el.fileName || 'Sans nom';
            else if(el.type === 'palette') name = el.paletteName || 'Palette';
            else if(el.type === 'link') name = el.title || 'Lien';
            else if(el.type === 'drawing') name = 'Dessin';
            else name = typeLabel;
            
            let linkedHtml = '';
            if(el.linkedTo) {
                const linkedLabel = MoodBoard.getLinkLabel(el.linkedTo);
                linkedHtml = `<div class="el-linked">🔗 ${linkedLabel}</div>`;
            }
            
            const layerOptions = board.layers.map(l => `<option value="${l.id}"${l.id === MoodBoard._elementLayerId(board, el) ? ' selected' : ''}>${Utils.escape(l.name)}</option>`).join('');
            const layerSelectHtml = board.layers.length > 1
                ? `<select class="el-layer-select" onclick="event.stopPropagation()" onchange="event.stopPropagation(); app.MoodBoard.moveElementToLayer('${el.id}', this.value)" title="Déplacer vers un autre calque">${layerOptions}</select>`
                : '';
            
            return `
                <div class="moodboard-element-item ${isSelected ? 'selected' : ''}" 
                     onclick="app.MoodBoard.selectElement('${el.id}')"
                     ondblclick="app.MoodBoard.focusElement('${el.id}')">
                    <span class="el-icon">${icon}</span>
                    <div class="el-info">
                        <div class="el-type">${typeLabel}</div>
                        <div class="el-name">${Utils.escape(name)}</div>
                        ${linkedHtml}
                        ${layerSelectHtml}
                    </div>
                    <div class="el-actions">
                        <button onclick="event.stopPropagation(); app.MoodBoard.editElement('${el.id}')" title="Modifier">✏️</button>
                        <button onclick="event.stopPropagation(); app.MoodBoard.deleteElement('${el.id}')" title="Supprimer">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    getLinkLabel: (linkedTo) => {
        if(!linkedTo) return '';
        if(linkedTo.type === 'project') return 'Projet';
        
        const collections = {
            'scene': state.data.scenes,
            'character': state.data.characters,
            'actor': state.data.actors,
            'location': state.data.locations,
            'resource': state.data.resources
        };
        
        const labels = {
            'scene': 'Scène',
            'character': 'Personnage',
            'actor': 'Comédien',
            'location': 'Décor',
            'resource': 'Ressource'
        };
        
        const collection = collections[linkedTo.type] || [];
        const item = collection.find(i => i.id === linkedTo.id);
        
        if(item) {
            return `${labels[linkedTo.type]}: ${item.name || item.title || linkedTo.id}`;
        }
        return labels[linkedTo.type] || linkedTo.type;
    },
    
    moveElementUp: (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const el = board.elements.find(e => e.id === elementId);
        if(!el || !MoodBoard._canInteract(board, el)) return;
        
        const layerId = MoodBoard._elementLayerId(board, el);
        const sameLayerIdx = [];
        board.elements.forEach((e, i) => { if(MoodBoard._elementLayerId(board, e) === layerId) sameLayerIdx.push(i); });
        const pos = sameLayerIdx.indexOf(board.elements.indexOf(el));
        
        if(pos < sameLayerIdx.length - 1) {
            const a = sameLayerIdx[pos], b = sameLayerIdx[pos + 1];
            const temp = board.elements[a];
            board.elements[a] = board.elements[b];
            board.elements[b] = temp;
            
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Élément monté', 'success');
        } else {
            Utils.toast('Déjà au premier plan de son calque', 'info');
        }
    },
    
    moveElementDown: (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const el = board.elements.find(e => e.id === elementId);
        if(!el || !MoodBoard._canInteract(board, el)) return;
        
        const layerId = MoodBoard._elementLayerId(board, el);
        const sameLayerIdx = [];
        board.elements.forEach((e, i) => { if(MoodBoard._elementLayerId(board, e) === layerId) sameLayerIdx.push(i); });
        const pos = sameLayerIdx.indexOf(board.elements.indexOf(el));
        
        if(pos > 0) {
            const a = sameLayerIdx[pos], b = sameLayerIdx[pos - 1];
            const temp = board.elements[a];
            board.elements[a] = board.elements[b];
            board.elements[b] = temp;
            
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Élément descendu', 'success');
        } else {
            Utils.toast('Déjà en arrière-plan de son calque', 'info');
        }
    },
    
    focusElement: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        // Centrer la vue sur l'élément
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        if(!wrapper) return;
        
        const wrapperRect = wrapper.getBoundingClientRect();
        const centerX = wrapperRect.width / 2;
        const centerY = wrapperRect.height / 2;
        
        MoodBoard.panX = centerX - (element.x + element.width / 2) * MoodBoard.zoom;
        MoodBoard.panY = centerY - (element.y + element.height / 2) * MoodBoard.zoom;
        
        MoodBoard.updateCanvasTransform();
        MoodBoard.selectElement(elementId);
    },
    
    renderCanvas: () => {
        const canvas = document.getElementById('moodboardCanvas');
        if(!canvas) return;
        
        const board = MoodBoard.getCurrentBoard();
        if(!board) {
            canvas.innerHTML = '';
            MoodBoard.renderElementsList();
            return;
        }
        
        // Appliquer le format (classe + dimensions)
        MoodBoard.applyCanvasFormat(canvas, board.format || 'free');
        
        // Rendre les éléments, groupés par calque (ordre des calques = ordre
        // d'empilement), en sautant les calques masqués.
        const visibleOrdered = MoodBoard._orderedVisibleElements(board);
        canvas.innerHTML = visibleOrdered.map(el => MoodBoard.renderElement(el)).join('');
        
        // Attacher les événements
        visibleOrdered.forEach(el => {
            MoodBoard.attachElementEvents(el.id);
        });
        
        // Mettre à jour la liste des éléments et des calques dans la sidebar
        MoodBoard.renderElementsList();
        MoodBoard.renderLayersList();
        // La vignette suit le contenu. Branchee ICI et nulle part ailleurs :
        // renderCanvas est le passage oblige des trente et quelques endroits
        // qui ajoutent, suppriment ou rechargent des elements.
        MoodBoard.renderMinimap();
    },
    
    // Éléments dans l'ordre d'empilement réel (par calque, calques masqués
    // exclus). Les éléments d'un même calque gardent leur ordre relatif.
    // Tout ce qui est visible s'affiche — seule l'INTERACTION (sélection,
    // déplacement...) est restreinte au calque actif, voir _canInteract.
    _orderedVisibleElements: (board) => {
        const out = [];
        board.layers.forEach(layer => {
            if(layer.visible === false) return;
            board.elements.forEach(el => {
                if(MoodBoard._elementLayerId(board, el) === layer.id) out.push(el);
            });
        });
        return out;
    },
    
    renderElement: (el) => {
        const isSelected = el.id === MoodBoard.selectedElementId;
        const linkedBadge = el.linkedTo ? `<div class="element-linked-badge" title="Lié à: ${el.linkedTo.type}">🔗</div>` : '';
        let content = '';
        
        if(el.type === 'image' || el.type === 'drawing') {
            content = `<img class="moodboard-element-image" src="${el.src}" alt="">`;
        }
        
        if(el.type === 'text') {
            const bg = (el.bgColor && el.bgColor !== 'transparent') ? el.bgColor : 'transparent';
            const style = `
                font-family: ${el.fontFamily || 'Inter, sans-serif'};
                font-size: ${el.fontSize || 18}px;
                text-align: ${el.textAlign || 'left'};
                color: ${el.textColor || '#333333'};
                font-weight: ${el.fontBold ? 'bold' : 'normal'};
                font-style: ${el.fontItalic ? 'italic' : 'normal'};
                text-decoration: ${el.fontUnderline ? 'underline' : 'none'};
                background: ${bg};
            `;
            content = `<div class="moodboard-element-text" style="${style}">${Utils.escape(el.content || '').replace(/\n/g, '<br>')}</div>`;
        }
        
        if(el.type === 'palette') {
            const colors = el.colors || ['#000000'];
            content = `<div class="moodboard-element-palette">
                ${el.paletteName ? `<div class="palette-title">${Utils.escape(el.paletteName)}</div>` : ''}
                <div class="palette-colors">
                    ${colors.map(c => `<div class="color-swatch" title="${c}">
                        <div class="color-swatch-box" style="background: ${c};"></div>
                        <span>${c}</span>
                    </div>`).join('')}
                </div>
            </div>`;
        }
        
        if(el.type === 'shape') {
            const shape = MoodBoard.shapes.find(s => s.id === el.shapeId);
            if(shape) {
                content = `<div class="moodboard-element-shape" style="color: ${el.color || '#000000'}; transform: rotate(${el.rotation || 0}deg);">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none">${shape.svg}</svg>
                </div>`;
            }
        }
        
        if(el.type === 'link') {
            content = `<div class="moodboard-element-link" ondblclick="window.open('${Utils.escape(Utils.safeUrl(el.url))}', '_blank')">
                <div class="link-icon">🔗</div>
                <div class="link-title">${Utils.escape(el.title || 'Lien')}</div>
                <div class="link-url">${Utils.escape(el.url || '').substring(0, 40)}...</div>
            </div>`;
        }
        
        if(el.type === 'file') {
            const icon = el.fileType.includes('pdf') ? '📄' : 
                        el.fileType.includes('word') || el.fileType.includes('doc') ? '📝' : '📁';
            const size = el.fileSize > 1024*1024 ? (el.fileSize/1024/1024).toFixed(1) + ' MB' : (el.fileSize/1024).toFixed(0) + ' KB';
            content = `<div class="moodboard-element-file" ondblclick="app.MoodBoard.openFile('${el.id}')">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${Utils.escape(el.fileName || 'Fichier')}</div>
                <div class="file-size">${size}</div>
            </div>`;
        }
        
        const rotateHandle = (el.type === 'shape' || el.type === 'image' || el.type === 'drawing') ? '<div class="rotate-handle" data-action="rotate"></div>' : '';
        
        const board = MoodBoard.getCurrentBoard();
        const inert = board ? !MoodBoard._canInteract(board, el) : false;
        return `
            <div class="moodboard-element ${isSelected ? 'selected' : ''} ${inert ? 'layer-inert' : ''}" 
                 id="mb-el-${el.id}"
                 data-id="${el.id}"
                 style="left: ${el.x}px; top: ${el.y}px; width: ${el.width}px; height: ${el.height}px; transform: rotate(${el.rotation || 0}deg); opacity: ${el.opacity == null ? 1 : el.opacity};">
                ${linkedBadge}
                ${rotateHandle}
                ${content}
                <div class="resize-handle se"></div>
                <div class="resize-handle sw"></div>
                <div class="resize-handle ne"></div>
                <div class="resize-handle nw"></div>
            </div>
        `;
    },
    
    attachElementEvents: (elementId) => {
        const el = document.getElementById('mb-el-' + elementId);
        if(!el) return;
        
        // Sélection au clic
        el.addEventListener('mousedown', (e) => {
            const board = MoodBoard.getCurrentBoard();
            const element = board?.elements.find(o => o.id === elementId);
            // Élément d'un autre calque (ou calque verrouillé) : visible, mais
            // ni sélectionnable ni manipulable tant que ce n'est pas le calque actif.
            if(!element || !board || !MoodBoard._canInteract(board, element)) return;
            
            // En lecture seule on garde la SELECTION (elle sert au panneau
            // d'information, qui est une lecture) mais aucune des trois
            // transformations : deplacer, redimensionner, tourner.
            if(MoodBoard.canWrite()) {
                if(e.target.classList.contains('resize-handle')) {
                    MoodBoard.startResize(elementId, e);
                } else if(e.target.classList.contains('rotate-handle')) {
                    MoodBoard.startRotate(elementId, e);
                } else {
                    MoodBoard.startDrag(elementId, e);
                }
            }
            MoodBoard.selectElement(elementId);
            e.stopPropagation();
        });
        
        // Édition du texte
        const textEl = el.querySelector('.moodboard-element-text');
        if(textEl) {
            textEl.addEventListener('blur', () => {
                MoodBoard.updateElementContent(elementId, textEl.innerText);
            });
        }
    },
    
    selectElement: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !board || !MoodBoard._canInteract(board, element)) return;
        
        MoodBoard.selectedElementId = elementId;
        
        // Mettre à jour les classes
        document.querySelectorAll('.moodboard-element').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === elementId);
        });
        
        // Mettre à jour le panneau d'info
        MoodBoard.updateInfoPanel();
        // Le lisere bleu de la vignette suit la selection : c'est ce qui
        // permet de retrouver un element perdu au bout de la planche.
        MoodBoard.renderMinimap();
    },
    
    startRotate: (elementId, e) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !MoodBoard._canInteract(board, element)) return;
        
        const domEl = document.getElementById('mb-el-' + elementId);
        if(!domEl) return;
        
        const rect = domEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
        const startRotation = element.rotation || 0;
        
        const onMouseMove = (e) => {
            const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
            let newRotation = startRotation + (currentAngle - startAngle);
            
            // Snap à 15° si Shift est pressé
            if(e.shiftKey) {
                newRotation = Math.round(newRotation / 15) * 15;
            }
            
            element.rotation = newRotation;
            domEl.style.transform = `rotate(${newRotation}deg)`;
        };
        
        const onMouseUp = () => {
            board.modifiedAt = Date.now();
            MoodBoard.renderMinimap();
            Store.save();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    },
    
    startDrag: (elementId, e) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !MoodBoard._canInteract(board, element)) return;
        
        MoodBoard.isDraggingElement = true;
        MoodBoard.dragOffsetX = (e.clientX / MoodBoard.zoom) - element.x;
        MoodBoard.dragOffsetY = (e.clientY / MoodBoard.zoom) - element.y;
        
        // Alignement (v594) : bords/centres des AUTRES elements de la planche,
        // pour aimanter la position pendant le glisser et tracer un repere.
        const others = board.elements.filter(o => o.id !== elementId);
        const linesX = [], linesY = [];
        others.forEach(o => {
            linesX.push(o.x, o.x + o.width / 2, o.x + o.width);
            linesY.push(o.y, o.y + o.height / 2, o.y + o.height);
        });
        const SNAP = 8 / MoodBoard.zoom;
        
        const onMouseMove = (e) => {
            if(!MoodBoard.isDraggingElement) return;
            
            let newX = (e.clientX / MoodBoard.zoom) - MoodBoard.dragOffsetX;
            let newY = (e.clientY / MoodBoard.zoom) - MoodBoard.dragOffsetY;
            newX = Math.max(0, newX);
            newY = Math.max(0, newY);
            
            let snapLineX = null, snapLineY = null;
            for(const cx of [newX, newX + element.width / 2, newX + element.width]) {
                const match = linesX.find(lx => Math.abs(lx - cx) <= SNAP);
                if(match != null) { newX += (match - cx); snapLineX = match; break; }
            }
            for(const cy of [newY, newY + element.height / 2, newY + element.height]) {
                const match = linesY.find(ly => Math.abs(ly - cy) <= SNAP);
                if(match != null) { newY += (match - cy); snapLineY = match; break; }
            }
            
            element.x = newX;
            element.y = newY;
            
            const domEl = document.getElementById('mb-el-' + elementId);
            if(domEl) {
                domEl.style.left = element.x + 'px';
                domEl.style.top = element.y + 'px';
            }
            MoodBoard.showSnapGuides(snapLineX, snapLineY);
        };
        
        const onMouseUp = () => {
            MoodBoard.isDraggingElement = false;
            MoodBoard.hideSnapGuides();
            board.modifiedAt = Date.now();
            // A la FIN du deplacement, pas pendant : redessiner la vignette a
            // chaque mouvement de souris ferait ramer une planche chargee.
            MoodBoard.renderMinimap();
            Store.save();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    },

    // Trace/efface les deux reperes d'aimantation (vertical + horizontal).
    showSnapGuides: (x, y) => {
        const canvas = document.getElementById('moodboardCanvas');
        if(!canvas) return;
        let vLine = document.getElementById('mbSnapLineV');
        if(x != null) {
            if(!vLine) { vLine = document.createElement('div'); vLine.id = 'mbSnapLineV'; vLine.className = 'mb-snap-line mb-snap-line-v'; canvas.appendChild(vLine); }
            vLine.style.left = x + 'px';
        } else if(vLine) vLine.remove();
        let hLine = document.getElementById('mbSnapLineH');
        if(y != null) {
            if(!hLine) { hLine = document.createElement('div'); hLine.id = 'mbSnapLineH'; hLine.className = 'mb-snap-line mb-snap-line-h'; canvas.appendChild(hLine); }
            hLine.style.top = y + 'px';
        } else if(hLine) hLine.remove();
    },

    hideSnapGuides: () => {
        const vLine = document.getElementById('mbSnapLineV'); if(vLine) vLine.remove();
        const hLine = document.getElementById('mbSnapLineH'); if(hLine) hLine.remove();
    },
    
    startResize: (elementId, e) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !MoodBoard._canInteract(board, element)) return;
        
        MoodBoard.isResizingElement = true;
        MoodBoard.resizeHandle = e.target.classList.contains('se') ? 'se' :
                                 e.target.classList.contains('sw') ? 'sw' :
                                 e.target.classList.contains('ne') ? 'ne' : 'nw';
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.width;
        const startHeight = element.height;
        const startElX = element.x;
        const startElY = element.y;
        
        const onMouseMove = (e) => {
            if(!MoodBoard.isResizingElement) return;
            
            const dx = (e.clientX - startX) / MoodBoard.zoom;
            const dy = (e.clientY - startY) / MoodBoard.zoom;
            
            if(MoodBoard.resizeHandle === 'se') {
                element.width = Math.max(80, startWidth + dx);
                element.height = Math.max(80, startHeight + dy);
            } else if(MoodBoard.resizeHandle === 'sw') {
                element.width = Math.max(80, startWidth - dx);
                element.height = Math.max(80, startHeight + dy);
                element.x = startElX + (startWidth - element.width);
            } else if(MoodBoard.resizeHandle === 'ne') {
                element.width = Math.max(80, startWidth + dx);
                element.height = Math.max(80, startHeight - dy);
                element.y = startElY + (startHeight - element.height);
            } else if(MoodBoard.resizeHandle === 'nw') {
                element.width = Math.max(80, startWidth - dx);
                element.height = Math.max(80, startHeight - dy);
                element.x = startElX + (startWidth - element.width);
                element.y = startElY + (startHeight - element.height);
            }
            
            const domEl = document.getElementById('mb-el-' + elementId);
            if(domEl) {
                domEl.style.left = element.x + 'px';
                domEl.style.top = element.y + 'px';
                domEl.style.width = element.width + 'px';
                domEl.style.height = element.height + 'px';
            }
        };
        
        const onMouseUp = () => {
            MoodBoard.isResizingElement = false;
            board.modifiedAt = Date.now();
            MoodBoard.renderMinimap();
            Store.save();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    },
    
    updateElementContent: (elementId, content) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        element.content = content;
        board.modifiedAt = Date.now();
        Store.save();
    },
    
    editElement: async (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        if(!MoodBoard._canInteract(board, element)) { Utils.toast('Élément sur un autre calque', 'warning'); return; }
        
        if(element.type === 'text') {
            MoodBoard.showTextPanel(element);
        }
        
        if(element.type === 'palette') {
            // Ouvrir l'éditeur de palette avec les couleurs existantes
            ColorWheel.open((colors, name) => {
                if(colors && colors.length > 0) {
                    element.colors = colors;
                    if(name) element.paletteName = name;
                    board.modifiedAt = Date.now();
                    Store.save();
                    MoodBoard.renderCanvas();
                    Utils.toast('Palette modifiée', 'success');
                }
            }, element.colors, element.paletteName);
        }
        
        if(element.type === 'link') {
            const url = await ConfirmModal.prompt('URL du lien :', 'Modifier le lien', 'https://...', element.url || '');
            if(url === null) return;
            
            element.url = url;
            try { element.title = new URL(url).hostname; } catch(e) { element.title = 'Lien'; }
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Lien modifié', 'success');
        }
        
        if(element.type === 'drawing') {
            // Réouvrir l'éditeur de dessin avec l'image existante
            MoodBoard.editDrawing(element);
        }
        
        if(element.type === 'image') {
            // Permettre de remplacer l'image
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if(!file) return;
                
                const reader = new FileReader();
                reader.onload = (ev) => {
                    element.src = ev.target.result;
                    element.fileName = file.name;
                    board.modifiedAt = Date.now();
                    Store.save();
                    MoodBoard.renderCanvas();
                    Utils.toast('Image remplacée', 'success');
                };
                reader.readAsDataURL(file);
            };
            input.click();
        }
        
        if(element.type === 'file') {
            Utils.toast('Double-cliquez pour ouvrir le fichier', 'info');
        }
    },
    
    linkElement: async (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        MoodBoard.showLinkModal(element, (linkedTo) => {
            element.linkedTo = linkedTo;
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Liaison mise à jour', 'success');
        });
    },
    
    showLinkModal: (target, callback) => {
        const modal = document.createElement('div');
        modal.className = 'confirm-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        // Construire les catégories
        const categories = [
            { id: 'project', icon: '🎬', label: 'Projet', items: [{ id: 'project', name: 'Projet entier' }] },
            { id: 'scene', icon: '📄', label: 'Scènes', items: (state.data.scenes || []).map((s, i) => ({ id: s.id, name: `Scène ${i+1}: ${s.title || 'Sans titre'}` })) },
            { id: 'character', icon: '👤', label: 'Personnages', items: (state.data.characters || []).map(c => ({ id: c.id, name: c.name })) },
            { id: 'actor', icon: '🎭', label: 'Comédiens', items: (state.data.actors || []).map(a => ({ id: a.id, name: a.name })) },
            { id: 'location', icon: '📍', label: 'Décors', items: (state.data.locations || []).map(l => ({ id: l.id, name: l.name })) },
            { id: 'resource', icon: '📦', label: 'Ressources', items: (state.data.resources || []).map(r => ({ id: r.id, name: r.name })) }
        ];
        
        // Valeur actuelle
        const currentType = target.linkedTo?.type || '';
        const currentId = target.linkedTo?.id || '';
        
        let categoriesHtml = categories.map(cat => {
            if(cat.items.length === 0) return '';
            const isActive = cat.id === currentType || (cat.id === 'project' && currentType === 'project');
            return `<button class="mb-link-cat-btn ${isActive ? 'active' : ''}" data-cat="${cat.id}" style="padding: 10px 15px; border: 1px solid var(--border); border-radius: 8px; background: ${isActive ? 'var(--primary)' : 'var(--bg)'}; color: ${isActive ? 'white' : 'var(--text-main)'}; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <span>${cat.icon}</span>
                <span>${cat.label}</span>
                <span style="opacity: 0.6; font-size: 0.8rem;">(${cat.items.length})</span>
            </button>`;
        }).join('');
        
        modal.innerHTML = `
            <div class="confirm-modal-box" style="max-width: 550px; max-height: 80vh; display: flex; flex-direction: column;">
                <div class="confirm-modal-icon">🔗</div>
                <div class="confirm-modal-title">Lier à un élément</div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 15px 0; justify-content: center;">
                    ${categoriesHtml}
                    <button class="mb-link-cat-btn ${!currentType ? 'active' : ''}" data-cat="" style="padding: 10px 15px; border: 1px solid var(--border); border-radius: 8px; background: ${!currentType ? 'var(--primary)' : 'var(--bg)'}; color: ${!currentType ? 'white' : 'var(--text-main)'}; cursor: pointer;">
                        ❌ Aucune liaison
                    </button>
                </div>
                
                <div id="mbLinkItemsList" style="flex: 1; overflow-y: auto; max-height: 300px; border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                    <p style="text-align: center; color: var(--text-sec);">Sélectionnez une catégorie</p>
                </div>
                
                <div class="confirm-modal-buttons">
                    <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const itemsList = modal.querySelector('#mbLinkItemsList');
        const catButtons = modal.querySelectorAll('.mb-link-cat-btn');
        
        const showItems = (catId) => {
            catButtons.forEach(btn => {
                btn.style.background = btn.dataset.cat === catId ? 'var(--primary)' : 'var(--bg)';
                btn.style.color = btn.dataset.cat === catId ? 'white' : 'var(--text-main)';
            });
            
            if(!catId) {
                // Aucune liaison
                callback(null);
                modal.remove();
                return;
            }
            
            const cat = categories.find(c => c.id === catId);
            if(!cat) return;
            
            if(catId === 'project') {
                callback({ type: 'project' });
                modal.remove();
                return;
            }
            
            itemsList.innerHTML = cat.items.map(item => {
                const isSelected = currentType === catId && currentId === item.id;
                return `<div class="mb-link-item" data-type="${catId}" data-id="${item.id}" style="padding: 12px; border-radius: 6px; cursor: pointer; margin-bottom: 5px; background: ${isSelected ? 'var(--primary)' : 'var(--bg)'}; color: ${isSelected ? 'white' : 'var(--text-main)'}; transition: background 0.2s;">
                    ${cat.icon} ${Utils.escape(item.name)}
                </div>`;
            }).join('');
            
            itemsList.querySelectorAll('.mb-link-item').forEach(item => {
                item.onmouseenter = () => { if(!item.style.background.includes('primary')) item.style.background = 'var(--border)'; };
                item.onmouseleave = () => { if(!item.style.background.includes('primary')) item.style.background = 'var(--bg)'; };
                item.onclick = () => {
                    callback({ type: item.dataset.type, id: item.dataset.id });
                    modal.remove();
                };
            });
        };
        
        catButtons.forEach(btn => {
            btn.onclick = () => showItems(btn.dataset.cat);
        });
        
        // Afficher la catégorie actuelle si elle existe
        if(currentType && currentType !== 'project') {
            showItems(currentType);
        }
    },
    
    duplicateElement: (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        const newElement = JSON.parse(JSON.stringify(element));
        newElement.id = 'el_' + Utils.generateUniqueId();
        newElement.x += 30;
        newElement.y += 30;
        newElement.createdAt = Date.now();
        
        board.elements.push(newElement);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        MoodBoard.selectElement(newElement.id);
        Utils.toast('Élément dupliqué', 'success');
    },
    
    deleteElement: async (elementId) => {
        if(!MoodBoard.canWrite()) { Utils.toast("Vous n'avez pas les droits de modification sur le mood board.", 'error'); return; }
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const target = board.elements.find(el => el.id === elementId);
        if(target && !MoodBoard._canInteract(board, target)) { Utils.toast('Élément sur un autre calque', 'warning'); return; }
        
        board.elements = board.elements.filter(el => el.id !== elementId);
        board.modifiedAt = Date.now();
        Store.save();
        
        if(MoodBoard.selectedElementId === elementId) {
            MoodBoard.selectedElementId = null;
        }
        
        MoodBoard.renderCanvas();
        Utils.toast('Élément supprimé', 'success');
    },
    
    // ===== PANNEAU D'INFO =====
    toggleInfoPanel: () => {
        const panel = document.getElementById('moodboardInfoPanel');
        if(panel) {
            panel.classList.toggle('active');
            MoodBoard.updateInfoPanel();
        }
    },
    
    updateInfoPanel: () => {
        const panel = document.getElementById('moodboardInfoPanel');
        const content = document.getElementById('moodboardInfoContent');
        const title = document.getElementById('moodboardInfoTitle');
        if(!panel || !content || !panel.classList.contains('active')) return;
        
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === MoodBoard.selectedElementId);
        
        if(element) {
            title.textContent = 'Élément: ' + element.type;
            content.innerHTML = `
                <div class="info-row">
                    <label>Position X</label>
                    <input type="number" value="${Math.round(element.x)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'x', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Position Y</label>
                    <input type="number" value="${Math.round(element.y)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'y', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Largeur</label>
                    <input type="number" value="${Math.round(element.width)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'width', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Hauteur</label>
                    <input type="number" value="${Math.round(element.height)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'height', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Opacité (%)</label>
                    <input type="number" min="0" max="100" value="${Math.round((element.opacity == null ? 1 : element.opacity) * 100)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'opacity', Math.max(0, Math.min(100, parseFloat(this.value) || 0)) / 100)">
                </div>
                <div class="info-row">
                    <label>Lié à</label>
                    <input type="text" value="${element.linkedTo ? element.linkedTo.type + (element.linkedTo.id ? ': ' + element.linkedTo.id : '') : 'Aucun'}" readonly style="cursor: pointer;" onclick="app.MoodBoard.linkElement('${element.id}')">
                </div>
            `;
        } else if(board) {
            title.textContent = 'Planche: ' + board.name;
            content.innerHTML = `
                <div class="info-row">
                    <label>Nom</label>
                    <input type="text" value="${Utils.escape(board.name)}" onchange="app.MoodBoard.updateBoardName(this.value)">
                </div>
                <div class="info-row">
                    <label>Format</label>
                    <select onchange="app.MoodBoard.changeFormat(this.value)">
                        <option value="a4-landscape" ${board.format === 'a4-landscape' ? 'selected' : ''}>A4 Paysage</option>
                        <option value="a4-portrait" ${board.format === 'a4-portrait' ? 'selected' : ''}>A4 Portrait</option>
                        <option value="a3-landscape" ${board.format === 'a3-landscape' ? 'selected' : ''}>A3 Paysage</option>
                        <option value="a3-portrait" ${board.format === 'a3-portrait' ? 'selected' : ''}>A3 Portrait</option>
                        <option value="a2-landscape" ${board.format === 'a2-landscape' ? 'selected' : ''}>A2 Paysage</option>
                        <option value="a2-portrait" ${board.format === 'a2-portrait' ? 'selected' : ''}>A2 Portrait</option>
                        <option value="a0-landscape" ${board.format === 'a0-landscape' ? 'selected' : ''}>A0 Paysage</option>
                        <option value="a0-portrait" ${board.format === 'a0-portrait' ? 'selected' : ''}>A0 Portrait</option>
                    </select>
                </div>
                <div class="info-row">
                    <label>Éléments</label>
                    <input type="text" value="${board.elements.length}" readonly>
                </div>
                <div class="info-row">
                    <label>Lier la planche à</label>
                    <button onclick="app.MoodBoard.linkBoard()" style="width: 100%; padding: 8px; cursor: pointer;">🔗 Configurer...</button>
                </div>
            `;
        } else {
            title.textContent = 'Propriétés';
            content.innerHTML = '<p class="text-sec">Sélectionnez une planche ou un élément</p>';
        }
    },
    
    updateElementProp: (elementId, prop, value) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        element[prop] = value;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    updateBoardName: (name) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        board.name = name;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderBoardsList();
    },
    
    linkBoard: async () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        // Similaire à linkElement mais pour la planche
        const options = [
            { value: '', label: '— Aucune liaison —' },
            { value: 'project', label: '🎬 Projet global' }
        ];
        
        (state.data.scenes || []).forEach((scene, i) => {
            options.push({ value: `scene_${scene.id}`, label: `📄 Scène ${i+1}: ${scene.title}` });
        });
        
        (state.data.characters || []).forEach(char => {
            options.push({ value: `character_${char.id}`, label: `👤 ${char.name}` });
        });
        
        (state.data.actors || []).forEach(actor => {
            options.push({ value: `actor_${actor.id}`, label: `🎭 ${actor.name}` });
        });
        
        (state.data.locations || []).forEach(loc => {
            options.push({ value: `location_${loc.id}`, label: `📍 ${loc.name}` });
        });
        
        const currentValue = board.linkedTo ? `${board.linkedTo.type}_${board.linkedTo.id || ''}` : '';
        
        const result = await ConfirmModal.prompt({
            title: 'Lier cette planche',
            message: 'Associer cette planche à :',
            defaultValue: currentValue,
            type: 'select',
            options: options
        });
        
        if(result === null) return;
        
        if(result === '') {
            board.linkedTo = null;
        } else if(result === 'project') {
            board.linkedTo = { type: 'project' };
        } else {
            const [type, id] = result.split('_');
            board.linkedTo = { type, id };
        }
        
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderBoardsList();
        MoodBoard.updateInfoPanel();
        Utils.toast('Liaison mise à jour', 'success');
    },
    
    // ===== MENU RADIAL =====
    
    contextX: 0,
    contextY: 0,
    
    showRadialMenu: (x, y) => {
        MoodBoard.hideRadialMenu();
        
        const items = [
            { icon: '✏️', label: 'Dessiner', action: 'draw', angle: 0 },
            { icon: '📝', label: 'Texte', action: 'text', angle: 60 },
            { icon: '🎨', label: 'Palette', action: 'palette', angle: 120 },
            { icon: '⬡', label: 'Formes', action: 'shapes', angle: 180 },
            { icon: '📁', label: 'Image / Fichier', action: 'file', angle: 240 },
            { icon: '🔗', label: 'Lien web', action: 'link', angle: 300 }
        ];
        
        const radius = 80;
        
        const overlay = document.createElement('div');
        overlay.className = 'moodboard-radial-overlay';
        overlay.onclick = () => MoodBoard.hideRadialMenu();
        document.body.appendChild(overlay);
        
        const menu = document.createElement('div');
        menu.className = 'moodboard-radial-menu';
        menu.id = 'moodboardRadialMenu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        
        // Centre du menu
        const center = document.createElement('div');
        center.className = 'moodboard-radial-center';
        center.innerHTML = '✕';
        center.onclick = () => MoodBoard.hideRadialMenu();
        menu.appendChild(center);
        
        // Items du menu
        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'moodboard-radial-item';
            el.innerHTML = `${item.icon}<span class="radial-tooltip">${item.label}</span>`;
            
            const angleRad = (item.angle - 90) * Math.PI / 180;
            const itemX = Math.cos(angleRad) * radius;
            const itemY = Math.sin(angleRad) * radius;
            
            el.style.left = itemX + 'px';
            el.style.top = itemY + 'px';
            el.style.transitionDelay = (i * 0.03) + 's';
            
            el.onclick = () => {
                MoodBoard.hideRadialMenu();
                MoodBoard.handleRadialAction(item.action);
            };
            
            menu.appendChild(el);
        });
        
        document.body.appendChild(menu);
        
        // Activer l'animation
        requestAnimationFrame(() => menu.classList.add('active'));
    },
    
    hideRadialMenu: () => {
        const menu = document.getElementById('moodboardRadialMenu');
        const overlay = document.querySelector('.moodboard-radial-overlay');
        // 31 aout : .moodboard-palette-submenu n'est jamais cree nulle part —
        // seul le panneau texte existe reellement.
        const submenu = document.querySelector('.moodboard-text-panel');
        if(menu) menu.remove();
        if(overlay) overlay.remove();
        if(submenu) submenu.remove();
    },
    
    handleRadialAction: (action) => {
        switch(action) {
            case 'draw':
                MoodBoard.openDrawingTool();
                break;
            case 'text':
                MoodBoard.showTextPanel();
                break;
            case 'palette':
                ColorWheel.open((colors, name) => MoodBoard.addPaletteToBoard(colors, name));
                break;
            case 'shapes':
                MoodBoard.showShapesMenu();
                break;
            case 'file':
                MoodBoard.uploadFile();
                break;
            case 'link':
                MoodBoard.addWebLink();
                break;
        }
    },
    
    showElementContextMenu: (x, y, elementId) => {
        MoodBoard.hideRadialMenu();
        MoodBoard.selectElement(elementId);
        
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        
        const overlay = document.createElement('div');
        overlay.className = 'moodboard-radial-overlay';
        overlay.onclick = () => MoodBoard.hideRadialMenu();
        document.body.appendChild(overlay);
        
        const menu = document.createElement('div');
        menu.className = 'moodboard-radial-menu';
        menu.id = 'moodboardRadialMenu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        
        let items = [
            { icon: '⬆️', label: 'Monter', action: () => MoodBoard.moveElementUp(elementId) },
            { icon: '⬇️', label: 'Descendre', action: () => MoodBoard.moveElementDown(elementId) },
            { icon: '🔗', label: 'Lier à...', action: () => MoodBoard.linkElement(elementId) },
            { icon: '📋', label: 'Dupliquer', action: () => MoodBoard.duplicateElement(elementId) },
            { icon: '✏️', label: 'Modifier', action: () => MoodBoard.editElement(elementId) },
            { icon: '🗑️', label: 'Supprimer', action: () => MoodBoard.deleteElement(elementId) }
        ];
        
        // Ajouter option couleur pour les formes
        if(element && element.type === 'shape') {
            items.splice(4, 0, { icon: '🎨', label: 'Couleur', action: () => MoodBoard.changeShapeColor(elementId) });
        }
        
        // Ajouter option renommer pour les palettes
        if(element && element.type === 'palette') {
            items.splice(4, 0, { icon: '✏️', label: 'Renommer', action: () => MoodBoard.renamePalette(elementId) });
        }
        
        // Extraire une palette de couleurs depuis une photo posée sur la planche
        if(element && (element.type === 'image' || element.type === 'drawing')) {
            items.splice(4, 0, { icon: '🎨', label: 'Extraire palette', action: () => MoodBoard.extractPaletteFromImage(elementId) });
        }
        
        const radius = 85;
        
        const center = document.createElement('div');
        center.className = 'moodboard-radial-center';
        center.innerHTML = '✕';
        center.onclick = () => MoodBoard.hideRadialMenu();
        menu.appendChild(center);
        
        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'moodboard-radial-item';
            el.innerHTML = `${item.icon}<span class="radial-tooltip">${item.label}</span>`;
            
            const angle = (i * 60);  // 6 items = 60° entre chaque
            const angleRad = (angle - 90) * Math.PI / 180;
            const itemX = Math.cos(angleRad) * radius;
            const itemY = Math.sin(angleRad) * radius;
            
            el.style.left = itemX + 'px';
            el.style.top = itemY + 'px';
            el.style.transitionDelay = (i * 0.03) + 's';
            
            el.onclick = () => {
                MoodBoard.hideRadialMenu();
                item.action();
            };
            
            menu.appendChild(el);
        });
        
        document.body.appendChild(menu);
        requestAnimationFrame(() => menu.classList.add('active'));
    },
    
    // ===== OUTILS DU MENU RADIAL =====
    editDrawing: (element) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board || !element) return;
        
        // Charger l'image existante dans le DrawingEditor
        DrawingEditor.open(null, (dataUrl) => {
            if(dataUrl) {
                element.src = dataUrl;
                board.modifiedAt = Date.now();
                Store.save();
                MoodBoard.renderCanvas();
                Utils.toast('Dessin modifié', 'success');
            }
        });
        
        // Charger l'image existante dans le premier calque après ouverture
        setTimeout(() => {
            if(element.src && DrawingEditor.layers.length > 0) {
                const img = new Image();
                img.onload = () => {
                    const ctx = DrawingEditor.layers[0].canvas.getContext('2d');
                    ctx.clearRect(0, 0, 800, 600);
                    ctx.drawImage(img, 0, 0, 800, 600);
                    DrawingEditor.redraw();
                };
                img.src = Utils.signedUrlFor(element.src);
            }
        }, 100);
    },
    
    openDrawingTool: () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        // Utiliser le DrawingEditor du Storyboard avec callback
        DrawingEditor.open(null, (dataUrl) => {
            if(dataUrl) {
                const element = {
                    id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: 'drawing',
                    x: MoodBoard.contextX,
                    y: MoodBoard.contextY,
                    width: 400,
                    height: 300,
                    src: dataUrl,
                    linkedTo: null,
                    layerId: MoodBoard._activeLayerId(board),
                    createdAt: Date.now()
                };
                
                board.elements.push(element);
                board.modifiedAt = Date.now();
                Store.save();
                MoodBoard.renderCanvas();
                Utils.toast('Dessin ajouté', 'success');
            }
        });
    },
    
    showTextPanel: (existingElement = null) => {
        const isEdit = !!existingElement;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const modal = document.createElement('div');
        modal.className = 'confirm-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        const currentContent = isEdit ? existingElement.content || '' : '';
        const currentFont = isEdit ? existingElement.fontFamily || 'Inter, sans-serif' : 'Inter, sans-serif';
        const currentSize = isEdit ? existingElement.fontSize || 18 : 18;
        const currentColor = isEdit ? existingElement.textColor || '#333333' : '#333333';
        const currentBold = isEdit ? existingElement.fontBold || false : false;
        const currentItalic = isEdit ? existingElement.fontItalic || false : false;
        const currentUnderline = isEdit ? existingElement.fontUnderline || false : false;
        const currentAlign = isEdit ? existingElement.textAlign || 'left' : 'left';
        const currentBgColor = isEdit ? existingElement.bgColor || 'transparent' : 'transparent';
        
        modal.innerHTML = `
            <div class="confirm-modal-box" style="max-width: 550px;">
                <div class="confirm-modal-icon">📝</div>
                <div class="confirm-modal-title">${isEdit ? 'Modifier le texte' : 'Ajouter du texte'}</div>
                
                <!-- Ligne 1: Police et taille -->
                <div style="display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap; align-items: center;">
                    <select id="mbTextFont" style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-main); min-width: 130px;">
                        <option value="Inter, sans-serif" ${currentFont.includes('Inter') ? 'selected' : ''}>Inter</option>
                        <option value="Georgia, serif" ${currentFont.includes('Georgia') ? 'selected' : ''}>Georgia</option>
                        <option value="'Courier New', monospace" ${currentFont.includes('Courier') ? 'selected' : ''}>Courier New</option>
                        <option value="'Comic Sans MS', cursive" ${currentFont.includes('Comic') ? 'selected' : ''}>Comic Sans</option>
                        <option value="Impact, sans-serif" ${currentFont.includes('Impact') ? 'selected' : ''}>Impact</option>
                        <option value="'Times New Roman', serif" ${currentFont.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                        <option value="Arial, sans-serif" ${currentFont.includes('Arial') ? 'selected' : ''}>Arial</option>
                        <option value="Verdana, sans-serif" ${currentFont.includes('Verdana') ? 'selected' : ''}>Verdana</option>
                        <option value="'Trebuchet MS', sans-serif" ${currentFont.includes('Trebuchet') ? 'selected' : ''}>Trebuchet</option>
                        <option value="'Lucida Console', monospace" ${currentFont.includes('Lucida') ? 'selected' : ''}>Lucida Console</option>
                    </select>
                    <select id="mbTextSize" style="padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-main); width: 75px;">
                        <option value="10" ${currentSize == 10 ? 'selected' : ''}>10px</option>
                        <option value="12" ${currentSize == 12 ? 'selected' : ''}>12px</option>
                        <option value="14" ${currentSize == 14 ? 'selected' : ''}>14px</option>
                        <option value="16" ${currentSize == 16 ? 'selected' : ''}>16px</option>
                        <option value="18" ${currentSize == 18 ? 'selected' : ''}>18px</option>
                        <option value="24" ${currentSize == 24 ? 'selected' : ''}>24px</option>
                        <option value="32" ${currentSize == 32 ? 'selected' : ''}>32px</option>
                        <option value="48" ${currentSize == 48 ? 'selected' : ''}>48px</option>
                        <option value="64" ${currentSize == 64 ? 'selected' : ''}>64px</option>
                        <option value="72" ${currentSize == 72 ? 'selected' : ''}>72px</option>
                    </select>
                </div>
                
                <!-- Ligne 2: Style et alignement -->
                <div style="display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; align-items: center;">
                    <div class="n8-flex-7">
                        <button type="button" id="mbTextBold" class="mb-text-style-btn ${currentBold ? 'active' : ''}" title="Gras" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; background: ${currentBold ? 'var(--primary)' : 'transparent'}; color: ${currentBold ? 'white' : 'var(--text-main)'};">B</button>
                        <button type="button" id="mbTextItalic" class="mb-text-style-btn ${currentItalic ? 'active' : ''}" title="Italique" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; font-style: italic; background: ${currentItalic ? 'var(--primary)' : 'transparent'}; color: ${currentItalic ? 'white' : 'var(--text-main)'};">I</button>
                        <button type="button" id="mbTextUnderline" class="mb-text-style-btn ${currentUnderline ? 'active' : ''}" title="Souligné" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; text-decoration: underline; background: ${currentUnderline ? 'var(--primary)' : 'transparent'}; color: ${currentUnderline ? 'white' : 'var(--text-main)'};">U</button>
                    </div>
                    <div class="n8-flex-7">
                        <button type="button" id="mbTextAlignLeft" class="mb-text-align-btn ${currentAlign === 'left' ? 'active' : ''}" title="Aligner à gauche" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; background: ${currentAlign === 'left' ? 'var(--primary)' : 'transparent'}; color: ${currentAlign === 'left' ? 'white' : 'var(--text-main)'};">⬛</button>
                        <button type="button" id="mbTextAlignCenter" class="mb-text-align-btn ${currentAlign === 'center' ? 'active' : ''}" title="Centrer" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; background: ${currentAlign === 'center' ? 'var(--primary)' : 'transparent'}; color: ${currentAlign === 'center' ? 'white' : 'var(--text-main)'};">⬛</button>
                        <button type="button" id="mbTextAlignRight" class="mb-text-align-btn ${currentAlign === 'right' ? 'active' : ''}" title="Aligner à droite" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; background: ${currentAlign === 'right' ? 'var(--primary)' : 'transparent'}; color: ${currentAlign === 'right' ? 'white' : 'var(--text-main)'};">⬛</button>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; margin-left: auto;">
                        <label class="text-sec-sm">Texte:</label>
                        <input type="color" id="mbTextColor" value="${currentColor}" class="n8-misc-2">
                        <label class="text-sec-sm">Fond:</label>
                        <input type="color" id="mbTextBgColor" value="${currentBgColor === 'transparent' ? '#ffffff' : currentBgColor}" class="n8-misc-2">
                        <label style="font-size: 0.75rem; display: flex; align-items: center; gap: 3px;"><input type="checkbox" id="mbTextBgTransparent" ${currentBgColor === 'transparent' ? 'checked' : ''}> Transparent</label>
                    </div>
                </div>
                
                <!-- Zone de texte -->
                <div style="margin: 15px 0;">
                    <textarea id="mbTextContent" placeholder="Votre texte ici..." data-tooltip="Votre texte ici..." style="width: 100%; height: 130px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; background: ${currentBgColor === 'transparent' ? 'var(--bg)' : currentBgColor}; color: ${currentColor}; resize: vertical; font-family: ${currentFont}; font-size: ${currentSize}px; font-weight: ${currentBold ? 'bold' : 'normal'}; font-style: ${currentItalic ? 'italic' : 'normal'}; text-decoration: ${currentUnderline ? 'underline' : 'none'}; text-align: ${currentAlign};">${Utils.escape(currentContent)}</textarea>
                </div>
                
                <div class="confirm-modal-buttons">
                    <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                    <button class="confirm-modal-btn confirm" id="mbSaveTextBtn">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const textarea = document.getElementById('mbTextContent');
        const fontSelect = document.getElementById('mbTextFont');
        const sizeSelect = document.getElementById('mbTextSize');
        const colorInput = document.getElementById('mbTextColor');
        const bgColorInput = document.getElementById('mbTextBgColor');
        const bgTransparentCb = document.getElementById('mbTextBgTransparent');
        const boldBtn = document.getElementById('mbTextBold');
        const italicBtn = document.getElementById('mbTextItalic');
        const underlineBtn = document.getElementById('mbTextUnderline');
        const alignLeftBtn = document.getElementById('mbTextAlignLeft');
        const alignCenterBtn = document.getElementById('mbTextAlignCenter');
        const alignRightBtn = document.getElementById('mbTextAlignRight');
        
        let isBold = currentBold;
        let isItalic = currentItalic;
        let isUnderline = currentUnderline;
        let textAlign = currentAlign;
        
        // Prévisualisation en direct
        const updatePreview = () => {
            textarea.style.fontFamily = fontSelect.value;
            textarea.style.fontSize = sizeSelect.value + 'px';
            textarea.style.color = colorInput.value;
            textarea.style.fontWeight = isBold ? 'bold' : 'normal';
            textarea.style.fontStyle = isItalic ? 'italic' : 'normal';
            textarea.style.textDecoration = isUnderline ? 'underline' : 'none';
            textarea.style.textAlign = textAlign;
            textarea.style.background = bgTransparentCb.checked ? 'var(--bg)' : bgColorInput.value;
        };
        
        const updateStyleBtn = (btn, active) => {
            btn.style.background = active ? 'var(--primary)' : 'transparent';
            btn.style.color = active ? 'white' : 'var(--text-main)';
        };
        
        const updateAlignBtns = () => {
            updateStyleBtn(alignLeftBtn, textAlign === 'left');
            updateStyleBtn(alignCenterBtn, textAlign === 'center');
            updateStyleBtn(alignRightBtn, textAlign === 'right');
        };
        
        fontSelect.onchange = updatePreview;
        sizeSelect.onchange = updatePreview;
        colorInput.oninput = updatePreview;
        bgColorInput.oninput = updatePreview;
        bgTransparentCb.onchange = updatePreview;
        
        boldBtn.onclick = () => { isBold = !isBold; updateStyleBtn(boldBtn, isBold); updatePreview(); };
        italicBtn.onclick = () => { isItalic = !isItalic; updateStyleBtn(italicBtn, isItalic); updatePreview(); };
        underlineBtn.onclick = () => { isUnderline = !isUnderline; updateStyleBtn(underlineBtn, isUnderline); updatePreview(); };
        
        alignLeftBtn.onclick = () => { textAlign = 'left'; updateAlignBtns(); updatePreview(); };
        alignCenterBtn.onclick = () => { textAlign = 'center'; updateAlignBtns(); updatePreview(); };
        alignRightBtn.onclick = () => { textAlign = 'right'; updateAlignBtns(); updatePreview(); };
        
        document.getElementById('mbSaveTextBtn').onclick = () => {
            const content = textarea.value.trim();
            if(!content) {
                Utils.toast('Entrez du texte', 'warning');
                return;
            }
            
            const textData = {
                content: content,
                fontFamily: fontSelect.value,
                fontSize: parseInt(sizeSelect.value),
                textColor: colorInput.value,
                fontBold: isBold,
                fontItalic: isItalic,
                fontUnderline: isUnderline,
                textAlign: textAlign,
                bgColor: bgTransparentCb.checked ? 'transparent' : bgColorInput.value
            };
            
            if(isEdit) {
                Object.assign(existingElement, textData);
            } else {
                const element = {
                    id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: 'text',
                    x: MoodBoard.contextX,
                    y: MoodBoard.contextY,
                    width: 280,
                    height: 160,
                    ...textData,
                    linkedTo: null,
                    layerId: MoodBoard._activeLayerId(board),
                    createdAt: Date.now()
                };
                board.elements.push(element);
            }
            
            board.modifiedAt = Date.now();
            Store.save();
            modal.remove();
            MoodBoard.renderCanvas();
            Utils.toast(isEdit ? 'Texte modifié' : 'Texte ajouté', 'success');
        };
        
        textarea.focus();
    },
    
    shapes: [
        // Formes de base
        { id: 'rect', icon: '⬜', name: 'Rectangle', svg: '<rect x="5" y="5" width="90" height="90" fill="currentColor"/>' },
        { id: 'rect-rounded', icon: '▢', name: 'Rectangle arrondi', svg: '<rect x="5" y="5" width="90" height="90" fill="currentColor" rx="15"/>' },
        { id: 'circle', icon: '⬤', name: 'Cercle', svg: '<circle cx="50" cy="50" r="45" fill="currentColor"/>' },
        { id: 'ellipse', icon: '⬭', name: 'Ellipse', svg: '<ellipse cx="50" cy="50" rx="45" ry="30" fill="currentColor"/>' },
        { id: 'triangle', icon: '▲', name: 'Triangle', svg: '<polygon points="50,5 95,95 5,95" fill="currentColor"/>' },
        { id: 'triangle-down', icon: '▼', name: 'Triangle inversé', svg: '<polygon points="5,5 95,5 50,95" fill="currentColor"/>' },
        { id: 'diamond', icon: '◆', name: 'Losange', svg: '<polygon points="50,5 95,50 50,95 5,50" fill="currentColor"/>' },
        { id: 'pentagon', icon: '⬠', name: 'Pentagone', svg: '<polygon points="50,5 97,38 79,95 21,95 3,38" fill="currentColor"/>' },
        { id: 'hexagon', icon: '⬡', name: 'Hexagone', svg: '<polygon points="50,5 93,25 93,75 50,95 7,75 7,25" fill="currentColor"/>' },
        { id: 'octagon', icon: '⯃', name: 'Octogone', svg: '<polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" fill="currentColor"/>' },
        { id: 'star', icon: '★', name: 'Étoile 5', svg: '<polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="currentColor"/>' },
        { id: 'star4', icon: '✦', name: 'Étoile 4', svg: '<polygon points="50,5 60,40 95,50 60,60 50,95 40,60 5,50 40,40" fill="currentColor"/>' },
        // Flèches
        { id: 'arrow-right', icon: '➡️', name: 'Flèche droite', svg: '<polygon points="5,30 55,30 55,10 95,50 55,90 55,70 5,70" fill="currentColor"/>' },
        { id: 'arrow-left', icon: '⬅️', name: 'Flèche gauche', svg: '<polygon points="95,30 45,30 45,10 5,50 45,90 45,70 95,70" fill="currentColor"/>' },
        { id: 'arrow-up', icon: '⬆️', name: 'Flèche haut', svg: '<polygon points="30,95 30,45 10,45 50,5 90,45 70,45 70,95" fill="currentColor"/>' },
        { id: 'arrow-down', icon: '⬇️', name: 'Flèche bas', svg: '<polygon points="30,5 30,55 10,55 50,95 90,55 70,55 70,5" fill="currentColor"/>' },
        { id: 'arrow-double', icon: '↔️', name: 'Flèche double', svg: '<polygon points="5,50 25,30 25,42 75,42 75,30 95,50 75,70 75,58 25,58 25,70" fill="currentColor"/>' },
        { id: 'chevron-right', icon: '›', name: 'Chevron droite', svg: '<polygon points="25,5 75,50 25,95 35,95 85,50 35,5" fill="currentColor"/>' },
        { id: 'chevron-left', icon: '‹', name: 'Chevron gauche', svg: '<polygon points="75,5 25,50 75,95 65,95 15,50 65,5" fill="currentColor"/>' },
        // Bulles et communication
        { id: 'bubble', icon: '💬', name: 'Bulle parole', svg: '<path d="M5,5 L95,5 Q98,5 98,8 L98,65 Q98,68 95,68 L35,68 L20,90 L20,68 L5,68 Q2,68 2,65 L2,8 Q2,5 5,5 Z" fill="currentColor"/>' },
        { id: 'bubble-round', icon: '🗨️', name: 'Bulle ronde', svg: '<ellipse cx="50" cy="40" rx="45" ry="35" fill="currentColor"/><polygon points="25,65 35,90 45,68" fill="currentColor"/>' },
        { id: 'bubble-thought', icon: '💭', name: 'Bulle pensée', svg: '<ellipse cx="50" cy="35" rx="40" ry="30" fill="currentColor"/><circle cx="25" cy="75" r="8" fill="currentColor"/><circle cx="15" cy="90" r="5" fill="currentColor"/>' },
        // Symboles
        { id: 'heart', icon: '❤️', name: 'Cœur', svg: '<path d="M50,90 C15,60 5,35 20,20 C35,5 50,15 50,30 C50,15 65,5 80,20 C95,35 85,60 50,90 Z" fill="currentColor"/>' },
        { id: 'cross', icon: '✚', name: 'Croix', svg: '<polygon points="35,5 65,5 65,35 95,35 95,65 65,65 65,95 35,95 35,65 5,65 5,35 35,35" fill="currentColor"/>' },
        { id: 'x-mark', icon: '✕', name: 'X', svg: '<polygon points="20,5 50,35 80,5 95,20 65,50 95,80 80,95 50,65 20,95 5,80 35,50 5,20" fill="currentColor"/>' },
        { id: 'check', icon: '✓', name: 'Check', svg: '<polygon points="10,50 20,40 40,60 80,20 90,30 40,85" fill="currentColor"/>' },
        { id: 'plus', icon: '＋', name: 'Plus', svg: '<rect x="40" y="10" width="20" height="80" fill="currentColor"/><rect x="10" y="40" width="80" height="20" fill="currentColor"/>' },
        { id: 'minus', icon: '−', name: 'Moins', svg: '<rect x="10" y="40" width="80" height="20" fill="currentColor" rx="3"/>' },
        // Lignes
        { id: 'line-h', icon: '─', name: 'Ligne horizontale', svg: '<rect x="5" y="45" width="90" height="10" fill="currentColor"/>' },
        { id: 'line-v', icon: '│', name: 'Ligne verticale', svg: '<rect x="45" y="5" width="10" height="90" fill="currentColor"/>' },
        { id: 'line-diag', icon: '╱', name: 'Ligne diagonale', svg: '<polygon points="90,5 95,10 10,95 5,90" fill="currentColor"/>' },
        // Cadres
        { id: 'frame', icon: '☐', name: 'Cadre', svg: '<rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" stroke-width="8"/>' },
        { id: 'frame-rounded', icon: '⃞', name: 'Cadre arrondi', svg: '<rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" stroke-width="8" rx="15"/>' },
        { id: 'circle-frame', icon: '○', name: 'Cercle vide', svg: '<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="8"/>' }
    ],
    
    showShapesMenu: () => {
        MoodBoard.hideRadialMenu();
        
        const menu = document.createElement('div');
        menu.className = 'moodboard-shape-submenu';
        menu.id = 'moodboardShapeMenu';
        
        MoodBoard.shapes.forEach(shape => {
            const btn = document.createElement('div');
            btn.className = 'moodboard-shape-option';
            btn.innerHTML = shape.icon;
            btn.title = shape.name;
            btn.onclick = () => {
                MoodBoard.addShape(shape.id);
                menu.remove();
            };
            menu.appendChild(btn);
        });
        
        document.body.appendChild(menu);
        
        // Positionner près du clic mais toujours visible
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        const rect = wrapper.getBoundingClientRect();
        let posX = MoodBoard.contextX * MoodBoard.zoom + MoodBoard.panX + rect.left;
        let posY = MoodBoard.contextY * MoodBoard.zoom + MoodBoard.panY + rect.top;
        
        // Ajuster si le menu dépasse à droite
        const menuRect = menu.getBoundingClientRect();
        if(posX + menuRect.width > window.innerWidth - 20) {
            posX = window.innerWidth - menuRect.width - 20;
        }
        // Ajuster si le menu dépasse en bas
        if(posY + menuRect.height > window.innerHeight - 20) {
            posY = window.innerHeight - menuRect.height - 20;
        }
        // Ajuster si le menu dépasse en haut ou à gauche
        if(posX < 20) posX = 20;
        if(posY < 20) posY = 20;
        
        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';
        
        // Fermer si clic ailleurs
        setTimeout(() => {
            const closeHandler = (e) => {
                if(!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },
    
    renamePalette: async (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        MoodBoard.hideRadialMenu();
        
        const newName = await ConfirmModal.prompt('Nom de la palette :', 'Renommer la palette', 'Nom...', element.paletteName || 'Sans nom');
        if(newName !== null && newName.trim()) {
            element.paletteName = newName.trim();
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Palette renommée', 'success');
        }
    },
    
    changeShapeColor: async (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        MoodBoard.hideRadialMenu();
        
        const modal = document.createElement('div');
        modal.className = 'confirm-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div class="confirm-modal-box" style="max-width: 350px;">
                <div class="confirm-modal-icon">🎨</div>
                <div class="confirm-modal-title">Couleur de la forme</div>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 20px 0;">
                    ${['#000000', '#FFFFFF', '#FF0000', '#FF6B00', '#FFD700', '#00C853', '#2196F3', '#9C27B0', '#E91E63', '#795548', '#607D8B', '#00BCD4'].map(c => 
                        `<div onclick="document.getElementById('shapeColorInput').value='${c}'; document.getElementById('shapeColorPreview').style.background='${c}';" 
                             style="width: 40px; height: 40px; background: ${c}; border-radius: 8px; cursor: pointer; border: 2px solid ${c === '#FFFFFF' ? '#ddd' : 'transparent'}; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></div>`
                    ).join('')}
                </div>
                <div style="display: flex; align-items: center; gap: 10px; margin: 15px 0;">
                    <div id="shapeColorPreview" style="width: 50px; height: 50px; background: ${element.color || '#000000'}; border-radius: 8px; border: 1px solid #ddd;"></div>
                    <input type="color" id="shapeColorInput" value="${element.color || '#000000'}" 
                           onchange="document.getElementById('shapeColorPreview').style.background=this.value"
                           style="flex: 1; height: 50px; cursor: pointer; border: none; border-radius: 8px;">
                </div>
                <div class="confirm-modal-buttons">
                    <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                    <button class="confirm-modal-btn confirm" id="applyShapeColorBtn">Appliquer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('applyShapeColorBtn').onclick = () => {
            element.color = document.getElementById('shapeColorInput').value;
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            modal.remove();
            Utils.toast('Couleur modifiée', 'success');
        };
    },
    
    addShape: (shapeId) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const shape = MoodBoard.shapes.find(s => s.id === shapeId);
        if(!shape) return;
        
        const element = {
            id: 'el_' + Utils.generateUniqueId(),
            type: 'shape',
            shapeId: shapeId,
            x: MoodBoard.contextX,
            y: MoodBoard.contextY,
            width: 150,
            height: 150,
            color: '#000000',
            rotation: 0,
            linkedTo: null,
            layerId: MoodBoard._activeLayerId(board),
            createdAt: Date.now()
        };
        
        board.elements.push(element);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        Utils.toast('Forme ajoutée', 'success');
    },
    
    // Extrait une palette depuis une image posee sur la planche : ouvre le
    // meme outil que la creation normale de palette (la roue teinte/
    // harmonie), avec la photo affichee a cote et un bouton "Auto" qui relance
    // l'extraction. Reutilise le chargeur d'image de StoryboardExport : les
    // images du bucket prive doivent passer par un blob telecharge, jamais
    // par crossOrigin sur l'URL signee (sinon le canvas est "tainte" et
    // illisible).
    extractPaletteFromImage: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !element.src) return;
        if(typeof StoryboardExport === 'undefined' || !StoryboardExport._loadPrintImg) { Utils.toast('Extraction indisponible.', 'error'); return; }
        Utils.toast('Analyse de la photo...', 'info', 2000);
        const img = new Image();
        StoryboardExport._loadPrintImg(img, element.src, () => {
            try {
                const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                if(!w || !h) throw new Error('image vide');
                const maxDim = 300; // suffisant pour l'analyse et l'aperçu dans la fenetre
                const scale = Math.min(1, maxDim / Math.max(w, h));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(w * scale));
                canvas.height = Math.max(1, Math.round(h * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const photoSrc = canvas.toDataURL();
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const sample = (x, y) => {
                    const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
                    const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
                    const i = (py * canvas.width + px) * 4;
                    return '#' + [pixels[i], pixels[i + 1], pixels[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
                };
                // Retrouve, dans la photo, le pixel le plus proche d'une couleur
                // donnee — utilise pour replacer le point quand la couleur change
                // sans venir d'un clic sur la photo (harmonie, luminosite, hex saisi).
                const findNearestPixel = (hex) => {
                    const rgb = ColorWheel.hexToRgb(hex) || { r: 0, g: 0, b: 0 };
                    let best = null, bestDist = Infinity;
                    const step = 2; // un pixel sur deux : largement assez fin, deux fois plus rapide
                    for(let y = 0; y < canvas.height; y += step) {
                        for(let x = 0; x < canvas.width; x += step) {
                            const i = (y * canvas.width + x) * 4;
                            if(pixels[i + 3] < 100) continue;
                            const dr = pixels[i] - rgb.r, dg = pixels[i + 1] - rgb.g, db = pixels[i + 2] - rgb.b;
                            const d = dr * dr + dg * dg + db * db;
                            if(d < bestDist) { bestDist = d; best = { x, y }; }
                        }
                    }
                    return best || { x: canvas.width / 2, y: canvas.height / 2 };
                };
                const scan = MoodBoard._scanPhoto(canvas, ctx);
                const initialPoints = MoodBoard._computeHarmonyPalette(scan, 'analogous', null);
                ColorWheel.open((colors, name) => {
                    MoodBoard.contextX = element.x;
                    MoodBoard.contextY = element.y + element.height + 20;
                    MoodBoard.addPaletteToBoard(colors, name);
                }, initialPoints.map(c => c.hex), 'Palette extraite', {
                    photoSrc, canvasW: canvas.width, canvasH: canvas.height,
                    initialPoints, sample, findNearestPixel,
                    // Calcule les 5 couleurs pour une harmonie donnee, avec ou
                    // sans case verrouillee (glissee/tapee) — voir
                    // MoodBoard._computeHarmonyPalette pour le detail.
                    computePalette: (harmonyKey, lock) => MoodBoard._computeHarmonyPalette(scan, harmonyKey, lock)
                });
            } catch(e) {
                console.warn('[MoodBoard] extractPaletteFromImage:', e);
                Utils.toast("Impossible d'analyser cette image (protégée par le navigateur).", 'error');
            }
        });
    },

    // Scanne la photo et construit la liste des couleurs candidates (une par
    // bucket de teinte proche), avec teinte/saturation/luminosite calculees.
    // Calcule UNE FOIS a l'ouverture, puis reutilise par Auto et par le
    // glisser en direct — rescanner toute l'image a chaque mouvement de
    // souris serait trop lent.
    // Scanne la photo une seule fois et construit deux choses :
    //  - candidates : couleurs reelles moyennes par petit bucket de pixels
    //    (pour ancrer chaque case de la palette a un vrai pixel de la photo)
    //  - hueBins : le poids total de chaque famille de teinte sur l'ENSEMBLE
    //    de la photo (tous les verts ensemble, tous les oranges ensemble...),
    //    qui sert a reperer les plus grands regroupements de couleur.
    _scanPhoto: (canvas, ctx) => {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = {};
        const NBINS = 24; // pas de 15 degres
        const bins = Array.from({ length: NBINS }, () => ({ weight: 0 }));
        for(let y = 0; y < canvas.height; y++) {
            for(let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                if(data[i + 3] < 100) continue; // pixel transparent ignore
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
                const bkt = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0, sampleX: x, sampleY: y });
                bkt.r += r; bkt.g += g; bkt.b += b; bkt.n++;

                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                if(max === min) continue; // gris pur : pas de teinte fiable
                const sat = (max - min) / (255 - Math.abs(max + min - 255));
                if(sat < 0.15) continue; // trop peu sature pour compter dans une famille de teinte
                let h;
                const d = max - min;
                if(max === r) h = ((g - b) / d + (g < b ? 6 : 0));
                else if(max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h = (h * 60 + 360) % 360;
                bins[Math.floor(h / (360 / NBINS)) % NBINS].weight++;
            }
        }
        const candidates = Object.values(buckets).map(c => {
            const r = Math.round(c.r / c.n), g = Math.round(c.g / c.n), b = Math.round(c.b / c.n);
            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            const hsl = ColorWheel.hexToHsl(hex);
            return { r, g, b, n: c.n, x: c.sampleX, y: c.sampleY, hex, hue: hsl.h, sat: hsl.s, light: hsl.l };
        }).sort((a, b) => b.n - a.n).slice(0, 200);

        const hueBins = bins.map((bk, i) => ({ hue: (i + 0.5) * (360 / NBINS), weight: bk.weight })).filter(b => b.weight > 0);
        return { candidates, hueBins };
    },

    // Cherche la rotation de l'harmonie qui capture le mieux les plus gros
    // regroupements de teinte de la photo : essaie chaque famille de teinte
    // importante a la place de chacun des angles de l'harmonie, et garde la
    // rotation qui fait correspondre le plus de poids reel a l'ensemble des
    // angles.
    _findBestAnchor: (hueBins, harmonyKey) => {
        const def = (ColorWheel.harmonies[harmonyKey]) || { angles: [-30, -15, 0, 15, 30] };
        const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
        const major = hueBins.slice().sort((a, b) => b.weight - a.weight).slice(0, 12);
        if(!major.length) return 0;

        let bestAnchor = major[0].hue, bestScore = -1;
        major.forEach(candidate => {
            def.angles.forEach(angleAsThisSlot => {
                const anchor = (candidate.hue - angleAsThisSlot + 360) % 360;
                let score = 0;
                def.angles.forEach(a => {
                    const target = (anchor + a + 360) % 360;
                    let closest = hueBins[0];
                    hueBins.forEach(b => { if(hueDist(b.hue, target) < hueDist(closest.hue, target)) closest = b; });
                    score += closest.weight * Math.max(0, 1 - hueDist(closest.hue, target) / 40);
                });
                if(score > bestScore) { bestScore = score; bestAnchor = anchor; }
            });
        });
        return bestAnchor;
    },

    // Coeur du systeme : calcule les 5 couleurs de la palette pour une
    // harmonie donnee, sans jamais deformer sa forme (les ecarts de teinte
    // entre les 5 cases restent EXACTEMENT ceux de l'harmonie — comme les
    // coins d'un carre qui peut tourner et grossir/reduire mais jamais se
    // deformer). Deux modes :
    //  - lock=null (Auto) : la forme est posee la ou elle capture le mieux
    //    les grands regroupements de teinte de la photo (_findBestAnchor).
    //  - lock={idx, hue, sat, light, exact} : l'utilisateur a lui-meme fixe
    //    la case idx (glisser sur la roue/la photo, ou hex tape a la main) —
    //    la forme entiere tourne/change de taille autour de CE point-la.
    // Chaque case (sauf celle verrouillee avec une couleur exacte) est
    // ensuite ancree au vrai pixel de la photo le plus proche de sa cible
    // theorique, pour que la palette reste credible par rapport a l'image.
    _computeHarmonyPalette: (scan, harmonyKey, lock) => {
        const { candidates, hueBins } = scan;
        const def = (ColorWheel.harmonies[harmonyKey]) || { angles: [-30, -15, 0, 15, 30] };
        const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

        let anchorHue, baseSat, baseLight;
        if(lock) {
            anchorHue = (lock.hue - def.angles[lock.idx] + 360) % 360;
            baseSat = lock.sat;
            baseLight = lock.light;
        } else {
            anchorHue = MoodBoard._findBestAnchor(hueBins, harmonyKey);
            const near = candidates.filter(c => hueDist(c.hue, anchorHue) < 25 && c.sat > 12);
            const pool = near.length ? near : candidates;
            baseSat = pool.length ? pool.reduce((s, c) => s + c.sat, 0) / pool.length : 60;
            baseLight = pool.length ? pool.reduce((s, c) => s + c.light, 0) / pool.length : 50;
            baseLight = Math.max(20, Math.min(80, baseLight));
        }

        const theoretical = def.angles.map((angle, j) => ({
            hue: (anchorHue + angle + 360) % 360,
            saturation: Math.round(def.saturations ? def.saturations[j] : baseSat),
            lightness: Math.round(def.lightnesses ? def.lightnesses[j] : baseLight)
        }));

        return theoretical.map((t, j) => {
            if(lock && j === lock.idx && lock.exact) {
                return { ...t, hex: lock.exact.hex, x: lock.exact.x, y: lock.exact.y };
            }
            // N'accepter qu'un pixel assez sature : un gris/presque-neutre a une
            // teinte instable et pouvait sinon "gagner" par erreur au score.
            const saturated = candidates.filter(c => c.sat > 15);
            const pool = saturated.length ? saturated : candidates;
            let best = null, bestHueDist = Infinity, bestScore = Infinity;
            pool.forEach(c => {
                const hd = hueDist(c.hue, t.hue);
                const score = hd * 2 + Math.abs(c.light - t.lightness) * 0.5;
                if(score < bestScore) { bestScore = score; bestHueDist = hd; best = c; }
            });
            // Au-dela de cet ecart de teinte, ce n'est plus vraiment "cette
            // couleur" — mieux vaut le dire franchement que d'en inventer une.
            if(!best || bestHueDist > 30) {
                return { ...t, hex: null, x: null, y: null, notFound: true };
            }
            return { ...t, hex: best.hex, x: best.x, y: best.y };
        });
    },

    addPaletteToBoard: (colors, name) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const element = {
            id: 'el_' + Utils.generateUniqueId(),
            type: 'palette',
            x: MoodBoard.contextX,
            y: MoodBoard.contextY,
            width: 500,
            height: 200,
            colors: colors,
            paletteName: name,
            linkedTo: null,
            layerId: MoodBoard._activeLayerId(board),
            createdAt: Date.now()
        };
        
        board.elements.push(element);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        Utils.toast('Palette "' + name + '" ajoutée', 'success');
    },
    
    uploadFile: () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) {
            Utils.toast('Sélectionnez d\'abord une planche', 'warning');
            return;
        }
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx,image/*';
        input.multiple = true;
        input.onchange = async (e) => {
            Array.from(e.target.files).forEach((file, i) => {
                const offsetX = MoodBoard.contextX + i * 30;
                const offsetY = MoodBoard.contextY + i * 30;
                
                if(file.type.startsWith('image/')) {
                    MoodBoard.addImageFromFile(file, offsetX, offsetY);
                    return;
                }
                
                // Pour les documents, créer un élément fichier
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const currentBoard = MoodBoard.getCurrentBoard();
                    if(!currentBoard) return;
                    
                    const element = {
                        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        type: 'file',
                        x: offsetX,
                        y: offsetY,
                        width: 180,
                        height: 140,
                        fileName: file.name,
                        fileType: file.type || MoodBoard.getFileType(file.name),
                        fileSize: file.size,
                        fileData: ev.target.result,
                        linkedTo: null,
                        layerId: MoodBoard._activeLayerId(currentBoard),
                        createdAt: Date.now()
                    };
                    
                    currentBoard.elements.push(element);
                    currentBoard.modifiedAt = Date.now();
                    Store.save();
                    
                    MoodBoard.renderCanvas();
                    Utils.toast('Fichier ajouté: ' + file.name, 'success');
                };
                reader.readAsDataURL(file);
            });
        };
        input.click();
    },
    
    getFileType: (fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();
        const types = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'rtf': 'application/rtf'
        };
        return types[ext] || 'application/octet-stream';
    },
    
    openFile: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !element.fileData) return;
        
        // Ouvrir le fichier dans un nouvel onglet
        const win = window.open();
        if(element.fileType.includes('pdf')) {
            const pdfSrc = String(element.fileData);
            const safePdf = /^(data:application\/pdf[;,]|https:\/\/)/i.test(pdfSrc) ? pdfSrc.replace(/"/g, '%22') : '';
            if(safePdf) {
                win.document.write(`<iframe src="${safePdf}" style="width:100%;height:100%;border:none;"></iframe>`);
            } else {
                win.document.write('<p style="font-family:sans-serif;padding:20px;">Aperçu PDF indisponible.</p>');
            }
        } else {
            win.document.write(`<html><head><title>${Utils.escape(element.fileName)}</title></head><body>
                <p>Fichier: <strong>${Utils.escape(element.fileName)}</strong></p>
                <p><a href="${Utils.escape(element.fileData)}" download="${Utils.escape(element.fileName)}">📥 Télécharger</a></p>
            </body></html>`);
        }
    },
    
    addWebLink: async () => {
        const url = await ConfirmModal.prompt({
            title: 'Ajouter un lien web',
            message: 'URL du lien (page web, image, vidéo...) :',
            placeholder: 'https://...'
        });
        
        if(!url) return;
        
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const element = {
            id: 'el_' + Utils.generateUniqueId(),
            type: 'link',
            x: MoodBoard.contextX,
            y: MoodBoard.contextY,
            width: 200,
            height: 120,
            url: url,
            title: new URL(url).hostname || 'Lien',
            linkedTo: null,
            layerId: MoodBoard._activeLayerId(board),
            createdAt: Date.now()
        };
        
        board.elements.push(element);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        Utils.toast('Lien ajouté', 'success');
    },
    
    // ===== EXPORT =====
    
    // Convertir un SVG en image pour l'export
    svgToImage: (svgContent, color, width, height) => {
        return new Promise((resolve) => {
            const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${width}" height="${height}">${svgContent.replace(/currentColor/g, color)}</svg>`;
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
        });
    },
    
    exportPNG: (...a) => MoodBoardExport.exportPNG(...a),
    exportPDF: (...a) => MoodBoardExport.exportPDF(...a),

    // Modale d'options d'export (meme modele que les autres onglets : page de
    // garde + choix de ce qu'on exporte + Generer le PDF).
    openPdfModal: () => {
        const boards = state.data.moodboards || [];
        if(boards.length === 0) { Utils.toast('Aucune planche à exporter', 'warning'); return; }
        Actions.openExportModal('moodboard');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'moodboard');
        });
    },
};

const MoodBoardExport = {
    exportPNG: async () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) {
            Utils.toast('Aucune planche sélectionnée', 'warning');
            return;
        }
        
        Utils.toast('Génération du PNG en cours...', 'info');
        
        const canvasW = board.canvasWidth || 1200;
        const canvasH = board.canvasHeight || 800;
        const scale = 2;
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasW * scale;
        canvas.height = canvasH * scale;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        
        const elements = board.elements || [];
        
        // Préparer les images (images, dessins ET formes SVG)
        const imagesToLoad = [];
        elements.forEach(el => {
            if((el.type === 'image' || el.type === 'drawing') && el.src) {
                imagesToLoad.push({ el, type: 'image' });
            } else if(el.type === 'shape') {
                imagesToLoad.push({ el, type: 'shape' });
            }
        });
        
        // Charger toutes les images et convertir les SVG
        for(const item of imagesToLoad) {
            if(item.type === 'image') {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise(resolve => {
                    img.onload = () => { item.el.imgLoaded = img; resolve(); };
                    img.onerror = () => resolve();
                    img.src = Utils.signedUrlFor(item.el.src);
                });
            } else if(item.type === 'shape') {
                const shape = MoodBoard.shapes.find(s => s.id === item.el.shapeId);
                if(shape) {
                    const w = item.el.width || 100;
                    const h = item.el.height || 100;
                    item.el.shapeImg = await MoodBoard.svgToImage(shape.svg, item.el.color || '#000000', w * scale, h * scale);
                }
            }
        }
        
        // Dessiner tous les éléments
        elements.forEach(el => {
            const x = el.x || 0;
            const y = el.y || 0;
            const w = el.width || 100;
            const h = el.height || 100;
            
            ctx.save();
            
            if(el.rotation) {
                ctx.translate(x + w/2, y + h/2);
                ctx.rotate(el.rotation * Math.PI / 180);
                ctx.translate(-(x + w/2), -(y + h/2));
            }
            
            if(el.type === 'image' || el.type === 'drawing') {
                if(el.imgLoaded) ctx.drawImage(el.imgLoaded, x, y, w, h);
            } else if(el.type === 'text') {
                ctx.fillStyle = el.textColor || el.color || '#333333';
                ctx.font = `${el.bold ? 'bold ' : ''}${el.fontSize || 14}px ${el.fontFamily || 'Arial'}`;
                ctx.textAlign = el.textAlign || el.align || 'left';
                const lines = (el.content || '').split('\n');
                lines.forEach((line, i) => {
                    ctx.fillText(line, x + 5, y + 20 + (i * (el.fontSize || 14) * 1.2));
                });
            } else if(el.type === 'palette') {
                const colors = el.colors || [];
                const colorW = w / Math.max(colors.length, 1);
                colors.forEach((color, i) => {
                    ctx.fillStyle = color;
                    ctx.fillRect(x + (i * colorW), y, colorW, h * 0.7);
                    ctx.fillStyle = '#333';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(color, x + (i * colorW) + colorW/2, y + h * 0.9);
                });
                if(el.paletteName) {
                    ctx.fillStyle = '#666';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(el.paletteName, x, y - 5);
                }
            } else if(el.type === 'shape') {
                if(el.shapeImg) {
                    ctx.drawImage(el.shapeImg, x, y, w, h);
                } else {
                    ctx.fillStyle = el.color || '#000000';
                    ctx.fillRect(x, y, w, h);
                }
            } else if(el.type === 'link') {
                ctx.fillStyle = '#f0f0f0';
                ctx.strokeStyle = '#ccc';
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = '#2b6ef6';
                ctx.font = '12px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('🔗 ' + (el.url || 'Lien').substring(0, 30), x + 5, y + h/2 + 4);
            }
            
            ctx.restore();
        });
        
        // Nom de fichier explicite
        const projectTitle = state.data?.title || 'Projet';
        const boardName = board.name || 'MoodBoard';
        const filename = `${projectTitle}_MoodBoard_${boardName}`.replace(/[^a-z0-9àâäéèêëïîôùûüç_-]/gi, '_') + '.png';
        
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        Utils.toast('PNG exporté !', 'success');
        History.log('EXPORT', `MoodBoard "${board.name}" exporté en PNG`);
    },
    
    exportPDF: async (opts = {}) => {
        // [Phase D refonte v2] Export MoodBoard par rasterisation HORS-ÉCRAN
        // - Marche depuis n'importe quel onglet
        // - Toutes les planches du projet, même non affichées
        // - Crée un canvas invisible (-99999px), rasterise, supprime
        
        let allBoards = state.data.moodboards || [];
        if(opts.boardIds && opts.boardIds.length) allBoards = allBoards.filter(b => opts.boardIds.includes(b.id));
        if(allBoards.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucune planche disponible', 'warning');
            return;
        }
        
        if(!opts.returnBlob) Utils.toast('Génération du PDF MoodBoard...', 'info');
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        if(typeof html2canvas === 'undefined') {
            Utils.toast('html2canvas non chargé', 'error');
            return;
        }
        const projectTitle = state.data.title || 'Projet';
        const cleanT = (t) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');
        
        // ===== 1. Créer un canvas HORS-ÉCRAN (invisible à l'utilisateur) =====
        // Ce bloc div est positionné à -99999px : invisible, mais dans le DOM
        // donc html2canvas peut le rasteriser. Il sera supprimé après l'export.
        const canvasEl = document.createElement('div');
        canvasEl.id = 'moodboardCanvasOffscreen';
        canvasEl.className = 'moodboard-canvas';
        canvasEl.style.position = 'absolute';
        canvasEl.style.left = '-99999px';
        canvasEl.style.top = '0';
        canvasEl.style.pointerEvents = 'none';
        canvasEl.style.zIndex = '-9999';
        document.body.appendChild(canvasEl);
        
        // Dimensions exactes selon le format de planche (cohérent avec le CSS)
        const formatDimensions = MoodBoard.FORMATS;
        
        // ===== 2. Créer le PDF =====
        let doc = null;
        const A4 = { w: 210, h: 297 }; // mm
        
        try {
            // Pour chaque planche du projet : générer une page
            for(let bi = 0; bi < allBoards.length; bi++) {
                const board = allBoards[bi];
                const format = board.format || 'free';
                const dims = formatDimensions[format] || formatDimensions['free'];
                
                // Configurer le canvas hors-écran pour cette planche
                canvasEl.className = 'moodboard-canvas format-' + format;
                canvasEl.style.width = dims.w + 'px';
                canvasEl.style.height = dims.h + 'px';
                canvasEl.style.background = 'white';
                
                // Rendre les éléments de la planche dedans
                const elements = board.elements || [];
                canvasEl.innerHTML = elements.map(el => MoodBoard.renderElement(el)).join('');
                
                // Attendre le rendu et le chargement des images
                await new Promise(r => setTimeout(r, 300));
                const imgs = canvasEl.querySelectorAll('img');
                await Promise.all(Array.from(imgs).map(img => {
                    if(img.complete && img.naturalWidth > 0) return Promise.resolve();
                    return new Promise(resolve => {
                        img.onload = () => resolve();
                        img.onerror = () => resolve();
                        setTimeout(() => resolve(), 5000);
                    });
                }));
                await new Promise(r => setTimeout(r, 150));
                
                // ===== 3. Calculer la bounding box du contenu =====
                let captureRect;
                if(elements.length === 0) {
                    captureRect = { x: 0, y: 0, w: 600, h: 400 };
                } else if(format !== 'free') {
                    // Format fixe (a4, a3, a2 portrait/landscape) : capturer toute la planche
                    captureRect = { x: 0, y: 0, w: dims.w, h: dims.h };
                } else {
                    // Mode free : bounding box des éléments + marge
                    let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
                    elements.forEach(el => {
                        const x = el.x || 0;
                        const y = el.y || 0;
                        const w = el.width || 100;
                        const h = el.height || 100;
                        if(x < bx1) bx1 = x;
                        if(y < by1) by1 = y;
                        if(x + w > bx2) bx2 = x + w;
                        if(y + h > by2) by2 = y + h;
                    });
                    const m = 50;
                    captureRect = {
                        x: Math.max(0, bx1 - m),
                        y: Math.max(0, by1 - m),
                        w: Math.min(dims.w, (bx2 - bx1) + m * 2),
                        h: Math.min(dims.h, (by2 - by1) + m * 2)
                    };
                }
                
                // ===== 4. Rasteriser avec html2canvas =====
                let dataUrl = null;
                try {
                    const rendered = await html2canvas(canvasEl, {
                        x: captureRect.x,
                        y: captureRect.y,
                        width: captureRect.w,
                        height: captureRect.h,
                        scale: 1.5,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    dataUrl = rendered.toDataURL('image/jpeg', 0.85);
                } catch(err) {
                    console.warn('[MoodBoard PDF] html2canvas fail planche', board.name, err);
                    continue; // skip cette planche
                }
                
                if(!dataUrl) continue;
                
                // ===== 5. Déterminer l'orientation A4 selon le ratio =====
                const ratio = captureRect.w / captureRect.h;
                const orientation = ratio > 1 ? 'landscape' : 'portrait';
                const pageW = orientation === 'landscape' ? A4.h : A4.w;
                const pageH = orientation === 'landscape' ? A4.w : A4.h;
                
                // Créer le PDF avec la 1ère page (ou ajouter une nouvelle)
                if(!doc) {
                    // IMPORTANT : on crée TOUJOURS le doc en portrait pour la page de garde,
                    // peu importe l'orientation de la 1ère planche. La cover doit rester
                    // portrait pour ne pas être tournée 270° par la phase 7quater du Dossier.
                    doc = new jsPDF('p', 'mm', 'a4');
                    // Page de garde optionnelle (toujours en portrait)
                    if(opts.includeCover !== false && typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
                        PdfTheme.coverPage(doc, { sectionName: 'Mood Board' });
                        // Puis ajouter la 1ère vraie page selon l'orientation de la planche
                        doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                    } else {
                        // Pas de cover : il faut quand même créer la 1ère page dans la bonne orientation
                        // jsPDF a déjà créé une page portrait par défaut. Si la planche est paysage,
                        // on doit SUPPRIMER cette page portrait et ajouter une page paysage à la place.
                        if(orientation === 'landscape') {
                            doc.deletePage(1);
                            doc.addPage([A4.h, A4.w], 'landscape');
                        }
                    }
                } else {
                    doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                }
                
                // ===== 6. En-tête de page (bandeau gris) =====
                // Pages PORTRAIT : bandeau horizontal en haut (y=margin)
                // Pages PAYSAGE (tournées 270° dans le Dossier) : bandeau vertical sur le bord GAUCHE
                // logique (= bord HAUT visuel après rotation), texte tourné 270° pour rester lisible.
                const margin = 8;
                const headerH = 9; // épaisseur du bandeau en mm
                const footerZone = (typeof PdfTheme !== 'undefined' && PdfTheme.FOOTER_ZONE_MM) ? PdfTheme.FOOTER_ZONE_MM : 14;
                const isLandscape = orientation === 'landscape';
                
                const accentMB = PdfTheme.accentFor('Mood Board');
                
                let headerStartLogical; // marge effective côté "haut" logique de l'image
                
                if(!isLandscape) {
                    // PORTRAIT : titre horizontal en haut — meme porte que partout
                    // ailleurs depuis v601. Le bandeau plein ne servait pas a
                    // contraster avec l'image : il est pose dans la MARGE, sur du
                    // papier blanc, l'image commence en dessous.
                    const headerY = margin;
                    PdfTheme.sectionBand(doc, { x: margin, y: headerY, width: pageW - margin * 2,
                                                title: board.name || 'MoodBoard',
                                                right: projectTitle, accent: accentMB });
                    headerStartLogical = headerY + headerH + 3; // bas du bandeau (utilisé pour l'imgY)
                } else {
                    // PAYSAGE : bandeau VERTICAL sur le bord DROIT logique
                    // (= bord HAUT visuel après rotation 270° par phase 7quater)
                    // Note : on évite quand même la zone footer-rotationné (côté gauche logique)
                    // qui est à x=0..14mm, donc on positionne le bandeau loin de ça (côté droit).
                    const headerX = pageW - margin - headerH; // côté droit logique
                    // MEME DESSIN QUE LE TITRE HORIZONTAL, TOURNE D'UN QUART DE
                    // TOUR (v601). En paysage la page entiere est pivotee de 270°
                    // a la fin : le sens de lecture suit donc +y, et non +x.
                    // Ce qui etait « large de 2,4 et haut de 7,4 » devient donc
                    // « haut de 2,4 et large de 7,4 », et le filet passe du
                    // dessous du titre au cote interieur de la bande.
                    doc.setFillColor(...accentMB);
                    doc.rect(headerX + 1.2, margin, 7.4, 2.4, 'F');
                    doc.setDrawColor(...PdfTheme.tint(accentMB, 0.55));
                    doc.setLineWidth(0.4);
                    doc.line(headerX + 0.4, margin, headerX + 0.4, pageH - margin);
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                    
                    // Texte tourné 270° pour être lisible après rotation 270° de la page entière
                    // Avec angle:270, le texte s'étire vers le BAS depuis le point d'ancrage (x,y).
                    // Sur le bord droit logique = bord haut visuel après rotation :
                    //   - haut logique (y proche de ph) → côté GAUCHE visuel après rotation
                    //   - bas logique (y proche de 0)   → côté DROIT visuel après rotation
                    // Avec setRotation(degrees(270)), la transformation est :
                    //   bord HAUT logique  (y proche de ph) → bord DROIT visuel
                    //   bord BAS logique   (y proche de 0)  → bord GAUCHE visuel
                    // Avec angle:270 sur le texte, il s'étire vers le BAS logique depuis le point d'ancrage.
                    
                    // Le centrage vertical du texte dans le bandeau (axe X logique sur paysage)
                    // diffère du portrait à cause de l'inversion baseline/rotation. On utilise
                    // un offset empirique pour aligner le centre du glyphe sur le centre du bandeau.
                    // headerH=9, centre du bandeau = headerX + 4.5. Avec angle:270 et baseline en bas,
                    // on ajoute environ +2.7 pour positionner le glyphe centré.
                    const textOffset = 2.7;
                    
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    // Nom de la planche : visuellement à GAUCHE en haut visuel = côté BAS logique
                    const nameStr = cleanT(board.name || 'MoodBoard');
                    doc.text(nameStr, headerX + textOffset + 2.2, margin + 5.4, { angle: 270 });
                    
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                    // Titre projet : visuellement à DROITE en haut visuel = côté HAUT logique
                    const projTitleStr = cleanT(projectTitle);
                    const projTitleW = doc.getTextWidth(projTitleStr);
                    doc.text(projTitleStr, headerX + textOffset + 2.2, pageH - margin - 4 - projTitleW, { angle: 270 });
                    // L'image démarre à margin (côté gauche logique) et finit AVANT le bandeau
                    headerStartLogical = headerX;
                }
                
                // ===== 7. Insérer l'image rasterisée =====
                // PORTRAIT : zone utile = entre headerBottom et footerZone (axe vertical)
                // PAYSAGE  : zone utile = entre headerStartLogical (axe X) et footerZone (axe X)
                let availW, availH, imgX, imgY;
                if(!isLandscape) {
                    availW = pageW - margin * 2;
                    availH = pageH - headerStartLogical - footerZone;
                    let imgW = availW;
                    let imgH = imgW / ratio;
                    if(imgH > availH) { imgH = availH; imgW = imgH * ratio; }
                    imgX = (pageW - imgW) / 2;
                    imgY = headerStartLogical + ((availH - imgH) / 2);
                    try {
                        doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                    } catch(err) {
                        console.warn('[MoodBoard PDF] addImage fail:', err);
                    }
                } else {
                    // Paysage : le bandeau est à droite logique (sur la plage [headerStartLogical, pageW-margin])
                    // L'image doit donc occuper la zone à GAUCHE du bandeau, soit [footerZone, headerStartLogical-3]
                    // (en respectant la zone footer-rotationné à gauche).
                    const leftBound = footerZone; // zone footer-rotationné à gauche
                    availW = headerStartLogical - 3 - leftBound;
                    availH = pageH - margin * 2;
                    let imgW = availW;
                    let imgH = imgW / ratio;
                    if(imgH > availH) { imgH = availH; imgW = imgH * ratio; }
                    imgX = leftBound + ((availW - imgW) / 2);
                    imgY = (pageH - imgH) / 2;
                    try {
                        doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                    } catch(err) {
                        console.warn('[MoodBoard PDF] addImage fail:', err);
                    }
                }
                
                // Footer ad-hoc supprimé : géré uniformément par PdfTheme.applyFooters en fin d'export
            }
        } finally {
            // ===== 9. Supprimer le canvas hors-écran =====
            try { document.body.removeChild(canvasEl); } catch(e) {}
        }
        
        if(!doc) {
            if(!opts.returnBlob) Utils.toast('Echec generation MoodBoard PDF', 'error');
            return;
        }
        
        // ===== Footer unifié sur toutes les pages =====
        // En mode Dossier (returnBlob), on ne dessine RIEN ici. La pagination
        // globale sera ajoutée par buildDossierProd phase 7ter.
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { 
                skipFirstPage: opts.includeCover !== false,
                forDossier: !!opts.returnBlob
            });
        }
        
        // ===== 10. Téléchargement / blob =====
        // Pour returnBlob (mode Dossier de Production), la rotation paysage est
        // déjà gérée par buildDossierProd phase 7quater. On renvoie sans rotation.
        if(opts.returnBlob) return doc.output('blob');
        
        // En export solo : tourner les pages paysage 270° pour cohérence avec le Dossier
        let outBlob = doc.output('blob');
        if(typeof PdfTheme !== 'undefined' && PdfTheme.rotateLandscapePages) {
            outBlob = await PdfTheme.rotateLandscapePages(outBlob);
        }
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Mood Board')
            : `${cleanT(projectTitle) || 'Projet'} - Mood Board - moteur.studio.pdf`;
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Utils.toast(`Mood Board exporte ! (${allBoards.length} planche(s))`, 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `MoodBoard PDF généré (${allBoards.length} planches)`);
    },
};

const Storyboard = {
    // ===================== ÉTAT, SCÈNES & PLANS =====================
    currentSceneId: null,
    
    init: () => {
        Storyboard.renderScenesList();
        document.getElementById('sbNoScene').style.display = 'flex';
        document.getElementById('sbShotsContainer').style.display = 'none';
        // Recalcul auto de l'alignement des plans au redimensionnement (lié une seule fois)
        if(!Storyboard._resizeBound) {
            Storyboard._resizeBound = true;
            window.addEventListener('resize', () => {
                clearTimeout(Storyboard._resizeTimer);
                Storyboard._resizeTimer = setTimeout(() => {
                    if(Storyboard.currentSceneId) Storyboard.alignShotsToScene();
                }, 150);
            });
        }
    },
    
    renderScenesList: () => {
        const container = document.getElementById('sbScenesList');
        container.innerHTML = '';
        
        // S4 : filtrer par épisode actif pour les séries
        const scenesToRender = UI.getScenesForCurrentView();
        
        if(scenesToRender.length === 0) {
            const msg = (state.currentProjectType === 'series' && state.currentEpisodeId)
                ? 'Aucune scène dans cet épisode pour l\'instant. Ajoutez-en depuis le séquencier.'
                : 'Créez votre première scène pour commencer à construire votre séquencier. Chaque scène peut avoir un titre, un résumé et des personnages.';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎬</div>
                    <div class="empty-state-title">Aucune scène</div>
                    <div class="empty-state-desc">${msg}</div>
                    <button class="empty-state-btn" onclick="app.Actions.addScene()">+ Ajouter une scène</button>
                    <div class="empty-state-tips">💡 <strong>Astuce :</strong> Importez un scénario existant pour générer automatiquement les scènes.</div>
                </div>
            `;
            return;
        }
        
        scenesToRender.forEach((scene, idx) => {
            const shotCount = state.data.shots.filter(s => s.sceneId === scene.id).length;
            const sceneStatus = scene.status || 'not-verified';
            const isFinal = scene.isFinal === true;
            const div = document.createElement('div');
            div.className = 'sb-scene-item' + (Storyboard.currentSceneId === scene.id ? ' active' : '') + (isFinal ? '' : ' is-draft');
            // [Phase D - Bug 3] Badge brouillon/final pour signaler les scènes non validées
            const finalIcon = isFinal ? '✅' : '📝';
            const finalTitle = isFinal ? 'Scène validée' : 'Scène en brouillon (à valider avant storyboard)';
            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div class="sb-scene-title"><span title="${finalTitle}" style="margin-right:4px;">${finalIcon}</span>${UI.formatSceneNumber(scene, idx)} ${Utils.escape(scene.title)}</div>
                    <div class="scene-status-container"><span class="scene-status-badge ${sceneStatus}" onclick="event.stopPropagation(); app.UI.toggleSceneStatus('${scene.id}', event)">${SCENE_STATUS_LABELS[sceneStatus]}</span></div>
                </div>
                <div class="sb-scene-meta">${shotCount} plan(s)${!isFinal ? ' • <span style="color:#ff9800;">brouillon</span>' : ''}</div>
            `;
            div.onclick = () => Storyboard.selectScene(scene.id);
            container.appendChild(div);
        });
    },
    
    selectScene: (sceneId) => {
        Storyboard.currentSceneId = sceneId;
        Storyboard.renderScenesList();
        document.getElementById('sbNoScene').style.display = 'none';
        document.getElementById('sbShotsContainer').style.display = 'block';
        Storyboard.renderShots();
        Storyboard.alignShotsToScene();
    },

    // Aligne le haut de la colonne des plans sur la scène sélectionnée
    // (évite de devoir remonter quand on choisit une scène en bas de liste)
    alignShotsToScene: () => {
        const list = document.getElementById('sbScenesList');
        const shots = document.getElementById('sbShotsContainer');
        if(!list || !shots) return;
        const active = list.querySelector('.sb-scene-item.active');
        if(!active) { shots.style.marginTop = '0'; return; }
        const col = shots.parentElement;
        const padTop = parseFloat(getComputedStyle(col).paddingTop) || 0;
        const offset = active.getBoundingClientRect().top - col.getBoundingClientRect().top - padTop;
        shots.style.marginTop = Math.max(0, offset) + 'px';
    },
    
    // v599 — DIAGNOSTIC DES VIGNETTES, a taper dans la console du navigateur :
    //   app.Storyboard.diagVignettes()
    // Dit, plan par plan, ce que la liste a REELLEMENT de quoi dessiner. Sert a
    // trancher entre trois causes qui donnent le meme symptome a l'ecran :
    // le dessin n'est pas la / il est la mais ne se telecharge pas / il se
    // telecharge mais n'arrive pas jusqu'au canvas affiche.
    diagVignettes: () => {
        const shots = (state.data.shots || []).filter(s => s.sceneId === Storyboard.currentSceneId);
        const lignes = shots.map((s, i) => {
            const couches = (s.drawingData && Array.isArray(s.drawingData.layers))
                ? s.drawingData.layers.filter(l => l && l.visible) : [];
            const stockees = couches.filter(l => Utils._projPathFrom(l.imageData));
            const zone = s.drawings && s.drawings.original;
            const objets = (zone && Array.isArray(zone.objects)) ? zone.objects : [];
            const img = objets.filter(o => o && o.type === 'image');
            const cache = Storyboard._svgImageCache || {};
            const c = document.getElementById('compact-preview-' + s.id);
            return {
                plan: i + 1,
                type: s.imageType || '(aucun)',
                drawingData_racine: !!s.drawingData,
                calques_visibles: couches.length,
                calques_stockes: stockees.length,
                blobs_deja_en_cache: stockees.filter(l => StoryboardExport._blobCache.has(Utils._projPathFrom(l.imageData))).length,
                zone_original: !!(zone && zone.drawingData),
                objets_vectoriels: objets.length,
                // v599 : etat des OBJETS IMAGE inseres — c'est eux, et non les
                // calques, qui manquaient a l'appel. « non_signee » veut dire
                // que l'URL n'etait pas prete : l'image sera retentee au rendu
                // suivant. « echouee » veut dire que le chargement a echoue.
                objets_image: img.length,
                img_pretes: img.filter(o => { const e = cache['uploaded|' + o.id]; return e && e.ready && !e.failed; }).length,
                img_en_cours: img.filter(o => { const e = cache['uploaded|' + o.id]; return e && !e.ready; }).length,
                img_echouees: img.filter(o => { const e = cache['uploaded|' + o.id]; return e && e.failed; }).length,
                img_non_signees: img.filter(o => { const u = Utils.signedUrlFor(o.imageData); return !(typeof u === 'string' && /^(https?|data|blob):/.test(u)); }).length,
                // v599 : la valeur BRUTE et ce qu'en fait signedUrlFor — c'est
                // ce qui manquait pour trancher sans deviner.
                exemple_valeur: img.length ? String(img[0].imageData || '').slice(0, 70) : '',
                exemple_url: img.length ? String(Utils.signedUrlFor(img[0].imageData) || '').slice(0, 70) : '',
                exemple_chemin: img.length ? String(Utils._projPathFrom(img[0].imageData) || '(aucun)') : '',
                canvas_present: !!c,
                canvas_dans_le_document: !!(c && document.body.contains(c))
            };
        });
        console.log('repeintes de la liste depuis le chargement :', Storyboard._repeintes);
        try { console.table(lignes); } catch(e) { console.log(lignes); }
        return lignes;
    },

    renderShots: () => {
        const container = document.getElementById('sbShotsList');
        container.innerHTML = '';
        
        if(!state.data.shots) state.data.shots = [];
        
        // [Phase D - Bug 3] Si la scène n'est pas finalisée, afficher un appel à validation
        const currentScene = state.data.scenes.find(s => s.id === Storyboard.currentSceneId);
        if(currentScene && currentScene.isFinal !== true) {
            const addBtn = document.querySelector('#sbShotsContainer > button');
            if(addBtn) addBtn.style.display = 'none'; // masquer "Ajouter un Plan"
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; max-width:500px; margin:30px auto; background:var(--panel-bg); border:2px dashed #ff9800; border-radius:12px;">
                    <div style="font-size:3rem; margin-bottom:15px;">📝</div>
                    <h3 style="color:#ff9800; margin:0 0 10px 0;">Scène non validée</h3>
                    <p style="color:var(--text-sec); margin:0 0 20px 0; line-height:1.5;">
                        Avant de créer un storyboard pour <strong>"${Utils.escape(currentScene.title)}"</strong>, 
                        vous devez valider la scène. Cela garantit que le texte est définitif avant d'investir du temps en illustration.
                    </p>
                    <button onclick="app.Actions.finalizeScene('${currentScene.id}')" style="padding:12px 24px; background:var(--success); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:1rem;">
                        ✅ Valider cette scène
                    </button>
                    <div style="margin-top:15px; font-size:0.85rem; color:var(--text-sec);">
                        💡 Vous pouvez aussi valider depuis le Séquencier ou le Scénario.
                    </div>
                </div>
            `;
            return;
        }
        // Scène finalisée : on s'assure que le bouton "Ajouter un Plan" est visible
        const addBtn = document.querySelector('#sbShotsContainer > button');
        if(addBtn) addBtn.style.display = '';
        
        const shots = state.data.shots
            .filter(s => s.sceneId === Storyboard.currentSceneId)
            .sort((a, b) => a.order - b.order);
        
        if(shots.length === 0) {
            container.innerHTML = '<div class="empty-state">Aucun plan créé</div>';
            return;
        }
        
        // Create compact grid
        const grid = document.createElement('div');
        grid.className = 'shots-compact-grid';
        
        shots.forEach((shot, idx) => {
            const card = Storyboard.createCompactCard(shot, idx);
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
        
        // Setup drag and drop
        if(state.currentRole !== 'viewer') {
            Storyboard.setupDragDrop(grid);
        }
    },
    
    createCompactCard: (shot, idx) => {
        const sceneIndex = state.data.scenes.findIndex(s => s.id === Storyboard.currentSceneId) + 1;
        const card = document.createElement('div');
        card.className = 'shot-compact-card';
        card.draggable = state.currentRole !== 'viewer';
        card.dataset.shotId = shot.id;
        
        let imageHTML = '';
        const contenu = Storyboard.contenuPlan(shot);
        if(contenu.fond) {
            imageHTML = `<img src="${Utils.safeMediaUrl(contenu.fond)}" alt="Plan ${sceneIndex}.${idx + 1}">`;
        } else if(!contenu.vide) {
            imageHTML = `<canvas id="compact-preview-${shot.id}" width="800" height="600" style="max-width: 100%; max-height: 100%; object-fit: contain;"></canvas>`;
        } else {
            imageHTML = `<div style="color: #999; font-size: 2rem;">🎨</div>`;
        }
        
        const dirtyIndicator = shot.isDirty ? '<div class="shot-dirty-indicator">●</div>' : '';
        
        // Construire les infos techniques (acronymes)
        const techParts = [];
        if(shot.shotType) techParts.push(Storyboard.extractAcronym(shot.shotType));
        if(shot.cameraMove) techParts.push(Storyboard.extractAcronym(shot.cameraMove));
        if(shot.cameraMode) techParts.push(Storyboard.extractAcronym(shot.cameraMode));
        const techInfo = techParts.length > 0 ? `<div class="shot-compact-tech">${techParts.join(' • ')}</div>` : '';
        const nameInfo = shot.name ? `<div class="shot-compact-name">${Utils.escape(shot.name)}</div>` : '';
        
        // Phase 1 Storyboard : déterminer quelles zones sémantiques sont visibles
        const vis = shot.drawingsVisibility || { original: true, lighting: false, camera: false, actors: false };
        const hasZone = (k) => {
            const z = shot.drawings && shot.drawings[k];
            if(!z) return false;
            // Phase 3 : une zone est considérée "non vide" si elle a un dessin/image OU au moins 1 objet vectoriel
            return !!(z.drawingData || z.imageUrl || (Array.isArray(z.objects) && z.objects.length > 0));
        };
        const zoneHas = { lighting: hasZone('lighting'), camera: hasZone('camera'), actors: hasZone('actors') };
        const showAnyOverlay = (vis.lighting && zoneHas.lighting) || (vis.camera && zoneHas.camera) || (vis.actors && zoneHas.actors);
        
        // Petit indicateur visuel des zones disponibles (icônes sur la vignette)
        const indicators = [];
        if(zoneHas.lighting) indicators.push(`<span title="Annotation Lumière disponible" style="opacity:${vis.lighting ? 1 : 0.4};">💡</span>`);
        if(zoneHas.camera) indicators.push(`<span title="Annotation Caméra disponible" style="opacity:${vis.camera ? 1 : 0.4};">🎥</span>`);
        if(zoneHas.actors) indicators.push(`<span title="Annotation Acteurs disponible" style="opacity:${vis.actors ? 1 : 0.4};">🎭</span>`);
        const indicatorsHtml = indicators.length > 0 
            ? `<div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 3px; background: rgba(0,0,0,0.55); padding: 3px 6px; border-radius: 6px; font-size: 0.85em; z-index: 2;">${indicators.join('')}</div>` 
            : '';
        
        const overlayHtml = `<canvas id="compact-overlay-${shot.id}" width="800" height="600" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; object-fit: contain; ${showAnyOverlay ? '' : 'display: none;'}"></canvas>`;
        
        card.innerHTML = `
            ${dirtyIndicator}
            <div class="shot-compact-image" style="position: relative;" onclick="app.Storyboard.openEditModal('${shot.id}')">
                ${imageHTML}
                ${overlayHtml}
                ${indicatorsHtml}
            </div>
            <div class="shot-compact-footer">
                <span>Plan ${sceneIndex}.${idx + 1}</span>
                ${state.currentRole !== 'viewer' ? `
                <div style="display: flex; gap: 4px;">
                    <button class="shot-compact-duplicate" onclick="event.stopPropagation(); app.Storyboard.duplicateShot('${shot.id}')" title="Dupliquer ce plan">📋</button>
                    <button class="shot-compact-delete" onclick="app.Storyboard.deleteShot('${shot.id}', event)">🗑️</button>
                </div>` : ''}
            </div>
            ${nameInfo}
            ${techInfo}
        `;
        
        // Render drawing preview + overlay
        setTimeout(() => {
            const c0 = Storyboard.contenuPlan(shot);
            if(c0.calques) {
                const canvas = document.getElementById(`compact-preview-${shot.id}`);
                if(canvas) {
                    const ctx = canvas.getContext('2d');
                    DrawingEditor.renderDrawingData(ctx, c0.calques, `compact-preview-${shot.id}`);
                }
            }
            
            // Phase 4B v2 : rendre les objets de la zone Original (images insérées + autres)
            // Délai léger pour laisser le temps aux Image.onload des SVG/images de s'amorcer
            setTimeout(() => {
                const previewCanvas = document.getElementById(`compact-preview-${shot.id}`);
                if(previewCanvas) {
                    const pctx = previewCanvas.getContext('2d');
                    const originalZone = shot.drawings && shot.drawings.original;
                    if(originalZone && Array.isArray(originalZone.objects) && originalZone.objects.length > 0) {
                        Storyboard.renderObjectsOnCanvas(pctx, originalZone.objects);
                        // v599 : les objets IMAGE par le chemin de l'apercu, seul
                        // a savoir atteindre un media du bucket prive.
                        Storyboard.dessinerObjetsImage('compact-preview-' + shot.id, originalZone.objects);
                    }
                }
            }, 150);
            
            // Phase 1 Storyboard : rendu de l'overlay compact (zones sémantiques visibles)
            const overlayCanvas = document.getElementById(`compact-overlay-${shot.id}`);
            if(overlayCanvas) {
                const octx = overlayCanvas.getContext('2d');
                octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                const compactKinds = ['lighting', 'camera', 'actors'];
                compactKinds.forEach(k => {
                    if(!vis[k] || !zoneHas[k]) return;
                    const zone = shot.drawings && shot.drawings[k];
                    if(!zone) return;
                    if(zone.imageType === 'upload' && zone.imageUrl) {
                        const im = new Image();
                        // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                        if(typeof zone.imageUrl === 'string' && zone.imageUrl.startsWith('http')) im.crossOrigin = 'anonymous';
                        im.onload = () => { octx.drawImage(im, 0, 0, overlayCanvas.width, overlayCanvas.height); };
                        im.src = Utils.signedUrlFor(zone.imageUrl);
                    } else if(zone.drawingData) {
                        DrawingEditor.renderDrawingData(octx, zone.drawingData);
                    }
                });
                
                // Phase 3 Storyboard : rendre les objets vectoriels par-dessus les images pixel
                setTimeout(() => {
                    compactKinds.forEach(k => {
                        if(!vis[k] || !zoneHas[k]) return;
                        const zone = shot.drawings && shot.drawings[k];
                        if(zone && Array.isArray(zone.objects) && zone.objects.length > 0) {
                            Storyboard.renderObjectsOnCanvas(octx, zone.objects);
                        }
                    });
                }, 150);
            }
        }, 100);
        
        return card;
    },
    
    setupDragDrop: (container) => {
        const cards = container.querySelectorAll('.shot-compact-card');
        
        cards.forEach(card => {
            card.addEventListener('dragstart', () => {
                card.classList.add('dragging');
            });
            
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                Storyboard.updateShotOrder();
            });
        });
        
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = Storyboard.getDragAfterElement(container, e.clientX, e.clientY);
            const dragging = document.querySelector('.shot-compact-card.dragging');
            
            if(afterElement == null) {
                container.appendChild(dragging);
            } else {
                container.insertBefore(dragging, afterElement);
            }
        });
    },
    
    getDragAfterElement: (container, x, y) => {
        const draggableElements = [...container.querySelectorAll('.shot-compact-card:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offsetX = x - box.left - box.width / 2;
            const offsetY = y - box.top - box.height / 2;
            const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
            
            if(offset < closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.POSITIVE_INFINITY }).element;
    },
    
    updateShotOrder: () => {
        const cards = document.querySelectorAll('.shot-compact-card');
        const newOrder = [];
        
        cards.forEach((card, idx) => {
            const shotId = card.dataset.shotId;
            const shot = state.data.shots.find(s => s.id === shotId);
            if(shot) {
                shot.order = idx;
                newOrder.push(shot);
            }
        });
        
        Store.save();
    },
    
    // ====================================================================
    // SOURCE UNIQUE D'UNE VIGNETTE DE PLAN (v601)
    // ====================================================================
    // Un plan portait son image a DEUX endroits : la RACINE (ancien format) et
    // la zone « original », celle qu'ecrit l'editeur de dessin. Trois ecrans les
    // lisaient differemment — l'onglet la racine, l'editeur la zone, l'export
    // tantot l'une tantot l'autre — d'ou des images visibles ici et absentes la.
    // DESORMAIS UNE SEULE SOURCE : LA ZONE. Ce que montre l'editeur de dessin
    // est ce qui s'affiche partout et ce qui sort au PDF. Rien dans l'editeur =
    // case vide, ce qui est la reponse honnete.
    // LA RACINE N'EST PLUS LUE DU TOUT. Elle reste dans les donnees, et les
    // projets d'avant ne perdent rien : au chargement, Store recopie deja la
    // racine dans la zone quand celle-ci n'existe pas (migration « drawings »).
    // Les seuls plans qui deviennent vides sont ceux ou la zone existait DEJA en
    // restant vide a cote d'une image de racine — cas qu'aucun ecran de
    // l'application ne sait produire.
    contenuPlan: (shot) => {
        const z = (shot && shot.drawings && shot.drawings.original) || null;
        const objets = (z && Array.isArray(z.objects)) ? z.objects : [];
        const fond = (z && z.imageType === 'upload' && z.imageUrl) ? z.imageUrl : null;
        const calques = (z && z.drawingData) || null;
        return { fond, calques, objets, vide: !fond && !calques && objets.length === 0 };
    },

    createShotCard: (shot, idx) => {
        const card = document.createElement('div');
        card.className = 'shot-card';
        card.dataset.shotId = shot.id;
        card.dataset.fiche = 'shot:' + shot.id;   // v601 : verrou par fiche
        
        let imagePreview = '';
        const contenu = Storyboard.contenuPlan(shot);
        if(contenu.fond) {
            imagePreview = `<img src="${Utils.safeMediaUrl(contenu.fond)}" alt="Plan ${idx + 1}">`;
        } else if(!contenu.vide) {
            imagePreview = `<canvas id="preview-${shot.id}" width="800" height="600"></canvas>`;
        } else {
            imagePreview = `<div class="shot-upload-zone">
                <div style="font-size: 3rem; margin-bottom: 10px;">🎨</div>
                <div>Utilisez "Dessiner" à gauche pour ajouter une image</div>
            </div>`;
        }
        
        const isView = state.currentRole === 'viewer';
        
        // Phase 1 Storyboard : déterminer quelles zones sémantiques ont du contenu
        const vis = shot.drawingsVisibility || { original: true, lighting: false, camera: false, actors: false };
        const hasZone = (k) => {
            const z = shot.drawings && shot.drawings[k];
            if(!z) return false;
            // Phase 3 : une zone est considérée "non vide" si elle a un dessin/image OU au moins 1 objet vectoriel
            return !!(z.drawingData || z.imageUrl || (Array.isArray(z.objects) && z.objects.length > 0));
        };
        const zoneHas = { lighting: hasZone('lighting'), camera: hasZone('camera'), actors: hasZone('actors') };
        const showAnyOverlay = (vis.lighting && zoneHas.lighting) || (vis.camera && zoneHas.camera) || (vis.actors && zoneHas.actors);
        
        // Bouton toggle générique
        const toggleBtn = (kind, label, emoji, color) => {
            const has = zoneHas[kind];
            const isOn = vis[kind] && has;
            const opacity = has ? 1 : 0.35;
            const bg = isOn ? color : 'transparent';
            const txtColor = isOn ? 'white' : 'var(--text-main)';
            const title = has ? (isOn ? `Masquer ${label}` : `Afficher ${label}`) : `${label} (vide)`;
            return `<button onclick="event.stopPropagation(); app.Storyboard.toggleDrawingVisibility('${shot.id}', '${kind}')" 
                title="${title}"
                style="padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: ${bg}; color: ${txtColor}; cursor: pointer; font-size: 0.85em; opacity: ${opacity};">
                ${emoji} ${label}
            </button>`;
        };
        const togglesHtml = `
            <div class="shot-overlay-toggles" style="display: flex; gap: 6px; padding: 6px 10px; flex-wrap: wrap; background: var(--bg); border-bottom: 1px solid var(--border);">
                ${toggleBtn('lighting', 'Lumière', '💡', 'linear-gradient(135deg, #ffd54f, #ffb300)')}
                ${toggleBtn('camera', 'Caméra', '🎥', 'linear-gradient(135deg, #64b5f6, #1976d2)')}
                ${toggleBtn('actors', 'Acteurs', '🎭', 'linear-gradient(135deg, #ce93d8, #8e24aa)')}
            </div>
        `;
        
        // Overlay canvas (par-dessus l'image originale)
        const overlayHtml = `<canvas id="overlay-${shot.id}" width="800" height="600" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; ${showAnyOverlay ? '' : 'display: none;'}"></canvas>`;
        
        // Boutons Dessiner / Lumière / Caméra / Acteurs, à gauche de l'image :
        // avant, il fallait cliquer sur l'image pour faire apparaître ce menu
        // en popup ; les boutons sont maintenant toujours visibles là.
        const isOwner = state.currentRole === 'owner';
        const canEditOriginal = isView ? false : (isOwner || Permissions.canEdit('storyboard'));
        const canEditAnnotation = (kind) => isView ? false : (isOwner || Permissions.canEdit('storyboard_' + kind));
        const sideBtn = (onclick, bg, txtColor, label, locked) => `
            <button ${locked ? 'disabled title="Permission insuffisante"' : `onclick="${onclick}"`}
                style="padding: 10px 8px; background: ${bg}; color: ${txtColor}; border: none; border-radius: 8px; cursor: ${locked ? 'not-allowed' : 'pointer'}; font-size: 0.8rem; font-weight: 600; width: 100%; text-align: center; ${locked ? 'opacity: 0.4; filter: grayscale(60%);' : ''}">
                ${label}${locked ? ' 🔒' : ''}
            </button>`;
        const sideButtonsHtml = isView ? '' : `
            <div class="shot-side-buttons" style="display: flex; flex-direction: column; gap: 6px; width: 84px; flex-shrink: 0;">
                ${sideBtn(`app.Storyboard.chooseDrawing('${shot.id}')`, 'var(--primary)', 'white', '🎨 Dessiner', !canEditOriginal)}
                ${sideBtn(`app.Storyboard.chooseAnnotation('${shot.id}', 'lighting')`, 'linear-gradient(135deg, #ffd54f, #ffb300)', '#3e2723', '💡 Lumière', !canEditAnnotation('lighting'))}
                ${sideBtn(`app.Storyboard.chooseAnnotation('${shot.id}', 'camera')`, 'linear-gradient(135deg, #64b5f6, #1976d2)', 'white', '🎥 Caméra', !canEditAnnotation('camera'))}
                ${sideBtn(`app.Storyboard.chooseAnnotation('${shot.id}', 'actors')`, 'linear-gradient(135deg, #ce93d8, #8e24aa)', 'white', '🎭 Acteurs', !canEditAnnotation('actors'))}
            </div>`;
        
        card.innerHTML = `
            <div class="shot-header">
                <h3 class="m-0">Plan ${idx + 1}</h3>
                ${!isView ? `
                <div style="display: flex; gap: 6px;">
                    <button onclick="app.Storyboard.deleteShot('${shot.id}')" style="background: var(--danger); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ Supprimer</button>
                </div>` : ''}
            </div>
            
            ${togglesHtml}
            
            <div style="display: flex; gap: 10px; align-items: stretch;">
                ${sideButtonsHtml}
                <div class="shot-preview" style="position: relative; flex: 1;">
                    ${imagePreview}
                    ${overlayHtml}
                </div>
            </div>
            
            <div class="shot-meta-grid">
                <span class="shot-field-nom">Nom du plan</span>
                <input type="text" class="shot-input" placeholder="Nom du plan" data-tooltip="Nom du plan" value="${Utils.escape(shot.name || '')}" 
                    onchange="app.Storyboard.updateShot('${shot.id}', 'name', this.value)" ${isView ? 'disabled' : ''}>
                
                <span class="shot-field-nom">Type de plan</span>
                <select class="shot-input" onchange="app.Storyboard.updateShot('${shot.id}', 'shotType', this.value)" ${isView ? 'disabled' : ''}>
                    <option value="">Type de plan...</option>
                    ${CONFIG.shotTypes.map(t => `<option value="${t}" ${shot.shotType === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                
                <span class="shot-field-nom">Mouvement de caméra</span>
                <select class="shot-input" onchange="app.Storyboard.updateShot('${shot.id}', 'cameraMove', this.value)" ${isView ? 'disabled' : ''}>
                    <option value="">Mouvement...</option>
                    ${CONFIG.cameraMoves.map(m => `<option value="${m}" ${shot.cameraMove === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                
                <span class="shot-field-nom">Prise de vue</span>
                <select class="shot-input" onchange="app.Storyboard.updateShot('${shot.id}', 'cameraMode', this.value)" ${isView ? 'disabled' : ''}>
                    <option value="">Mode caméra...</option>
                    ${CONFIG.cameraModes.map(m => `<option value="${m}" ${shot.cameraMode === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
            </div>
            
            <span class="shot-field-nom">Description du plan</span>
            <textarea class="shot-textarea" placeholder="Description du plan..." data-tooltip="Description du plan..." 
                onchange="app.Storyboard.updateShot('${shot.id}', 'description', this.value)" ${isView ? 'disabled' : ''}>${shot.description || ''}</textarea>
            
            <span class="shot-field-nom">Direction des acteurs</span>
            <textarea class="shot-textarea" placeholder="Direction des acteurs..." data-tooltip="Direction des acteurs..." 
                onchange="app.Storyboard.updateShot('${shot.id}', 'actorDirection', this.value)" ${isView ? 'disabled' : ''}>${shot.actorDirection || ''}</textarea>
            
            <span class="shot-field-nom">Direction technique</span>
            <textarea class="shot-textarea" placeholder="Direction technique..." data-tooltip="Direction technique..." 
                onchange="app.Storyboard.updateShot('${shot.id}', 'technicalDirection', this.value)" ${isView ? 'disabled' : ''}>${shot.technicalDirection || ''}</textarea>
        `;
        
        // Render drawing preview if exists
        setTimeout(() => {
            const c1 = Storyboard.contenuPlan(shot);
            if(c1.calques) {
                const canvas = document.getElementById(`preview-${shot.id}`);
                if(canvas) {
                    const ctx = canvas.getContext('2d');
                    DrawingEditor.renderDrawingData(ctx, c1.calques, `preview-${shot.id}`);
                }
            }
            
            // Phase 4B v2 : rendre les objets de la zone Original (images insérées + autres)
            // Délai léger pour laisser le temps aux Image.onload des SVG/images de s'amorcer
            setTimeout(() => {
                const previewCanvas = document.getElementById(`preview-${shot.id}`);
                if(previewCanvas) {
                    const pctx = previewCanvas.getContext('2d');
                    const originalZone = shot.drawings && shot.drawings.original;
                    if(originalZone && Array.isArray(originalZone.objects) && originalZone.objects.length > 0) {
                        Storyboard.renderObjectsOnCanvas(pctx, originalZone.objects);
                        // v599 : les objets IMAGE par le chemin de l'apercu, seul
                        // a savoir atteindre un media du bucket prive.
                        Storyboard.dessinerObjetsImage('preview-' + shot.id, originalZone.objects);
                    }
                }
            }, 150);
            
            // Phase 1 Storyboard : rendu de l'overlay (zones sémantiques visibles)
            const overlayCanvas = document.getElementById(`overlay-${shot.id}`);
            if(overlayCanvas) {
                const octx = overlayCanvas.getContext('2d');
                octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                const overlayKinds = ['lighting', 'camera', 'actors'];
                overlayKinds.forEach(k => {
                    if(!vis[k] || !zoneHas[k]) return;
                    const zone = shot.drawings && shot.drawings[k];
                    if(!zone) return;
                    if(zone.imageType === 'upload' && zone.imageUrl) {
                        const im = new Image();
                        // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                        if(typeof zone.imageUrl === 'string' && zone.imageUrl.startsWith('http')) im.crossOrigin = 'anonymous';
                        im.onload = () => { octx.drawImage(im, 0, 0, overlayCanvas.width, overlayCanvas.height); };
                        im.src = Utils.signedUrlFor(zone.imageUrl);
                    } else if(zone.drawingData) {
                        DrawingEditor.renderDrawingData(octx, zone.drawingData);
                    }
                });
                
                // Phase 3 Storyboard : rendre les objets vectoriels par-dessus les images pixel
                // (délai léger pour laisser le temps aux Image.onload de s'exécuter)
                setTimeout(() => {
                    overlayKinds.forEach(k => {
                        if(!vis[k] || !zoneHas[k]) return;
                        const zone = shot.drawings && shot.drawings[k];
                        if(zone && Array.isArray(zone.objects) && zone.objects.length > 0) {
                            Storyboard.renderObjectsOnCanvas(octx, zone.objects);
                        }
                    });
                }, 150);
            }
        }, 100);
        
        return card;
    },
    
    addShot: () => {
        if(state.currentRole === 'viewer') return;
        if(state.currentRole !== 'owner' && !Permissions.canEdit('storyboard')) {
            Utils.toast('Vous n\'avez pas la permission de modifier le storyboard.', 'error');
            return;
        }
        if(!Storyboard.currentSceneId) return;
        
        // [Phase D - Bug 3] Sécurité : empêcher l'ajout de plans pour une scène non validée
        const targetScene = state.data.scenes.find(s => s.id === Storyboard.currentSceneId);
        if(targetScene && targetScene.isFinal !== true) {
            Utils.toast('Validez la scène avant d\'ajouter des plans', 'warning');
            return;
        }
        
        const existingShots = state.data.shots.filter(s => s.sceneId === Storyboard.currentSceneId);
        const maxOrder = existingShots.length > 0 ? Math.max(...existingShots.map(s => s.order)) : -1;
        
        const newShot = {
            id: Utils.generateUniqueId(),
            sceneId: Storyboard.currentSceneId,
            order: maxOrder + 1,
            name: '',
            imageType: null,
            imageUrl: null,
            drawingData: null,
            // Nouvelles zones d'annotation indépendantes (Phase 1)
            // Chaque zone : null OU { imageType: 'drawing'|'upload', imageUrl: ..., drawingData: {...} }
            drawings: {
                original: null,  // dessin du réa (clone de drawingData/imageUrl à la migration)
                lighting: null,  // 💡 chef op
                camera: null,    // 🎥 cadreur
                actors: null     // 🎭 réa/chorégraphe
            },
            // Visibilité par défaut des calques (vue lecture)
            drawingsVisibility: {
                original: true,
                lighting: false,
                camera: false,
                actors: false
            },
            shotType: '',
            cameraMove: '',
            cameraMode: '',
            description: '',
            actorDirection: '',
            technicalDirection: '',
            isDirty: false,
            lastModified: Date.now()
        };
        
        state.data.shots.push(newShot);
        const scene = state.data.scenes.find(s => s.id === Storyboard.currentSceneId);
        History.log('ADD', `Ajout plan storyboard : ${scene?.title || 'Scène inconnue'}`, { target: { kind: 'shot', id: newShot.id, label: scene?.title || 'Plan' }, link: { kind: 'shot', id: newShot.id, sceneId: Storyboard.currentSceneId } });
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
    },
    
    // Duplique un plan existant (calques, objets, textes) — placé à la fin de
    // la même scène plutôt qu'immédiatement après l'original, pour éviter de
    // devoir décaler l'ordre de tous les plans suivants.
    duplicateShot: (shotId) => {
        if(state.currentRole === 'viewer' || !Permissions.canEdit('storyboard')) return;
        const original = state.data.shots.find(s => s.id === shotId);
        if(!original) return;
        
        const existingShots = state.data.shots.filter(s => s.sceneId === original.sceneId);
        const maxOrder = existingShots.length > 0 ? Math.max(...existingShots.map(s => s.order)) : -1;
        
        const copy = JSON.parse(JSON.stringify(original));
        copy.id = Utils.generateUniqueId();
        copy.order = maxOrder + 1;
        copy.lastModified = Date.now();
        
        state.data.shots.push(copy);
        const scene = state.data.scenes.find(s => s.id === original.sceneId);
        History.log('ADD', `Duplication plan storyboard : ${scene?.title || 'Scène inconnue'}`, { target: { kind: 'shot', id: copy.id, label: scene?.title || 'Plan' }, link: { kind: 'shot', id: copy.id, sceneId: original.sceneId } });
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
        Utils.toast('Plan dupliqué', 'success');
    },
    
    // v595 : petit filet de rattrapage apres suppression d'un plan — le plan
    // complet (calques, objets dessines) reste en memoire 8s, avec un toast
    // "Annuler". Passe ce delai, seul le journal (recoverable, partiel) permet
    // de recuperer manuellement le contenu.
    _lastDeletedShot: null,
    _lastDeletedShotTimer: null,
    undoDeleteShot: () => {
        const pending = Storyboard._lastDeletedShot;
        if(!pending) return;
        clearTimeout(Storyboard._lastDeletedShotTimer);
        Storyboard._lastDeletedShot = null;
        const idx = (pending.index >= 0 && pending.index <= state.data.shots.length) ? pending.index : state.data.shots.length;
        state.data.shots.splice(idx, 0, pending.shot);
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
        const toastEl = document.getElementById('shot-undo-toast');
        if(toastEl) toastEl.remove();
        Utils.toast('Plan restauré', 'success');
    },
    
    deleteShot: async (shotId, event) => {
        if(event) event.stopPropagation();
        if(state.currentRole === 'viewer' || !Permissions.canEdit('storyboard')) return;
        if(!await ConfirmModal.confirmDelete("Ce plan sera définitivement supprimé.")) return;
        
        const shot = state.data.shots.find(s => s.id === shotId);
        const shotIndex = state.data.shots.findIndex(s => s.id === shotId);
        const scene = state.data.scenes.find(s => s.id === shot?.sceneId);
        
        // [Phase D] Capturer le contenu récupérable AVANT suppression (médias gardés dans le journal)
        // On ne supprime plus immédiatement les fichiers Storage : ils seront nettoyés via cleanupExpiredEntry
        const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const recoverable = shot ? await History.captureRecoverable(shot, 'shot', logId) : null;
        // Compléter avec le contexte de la scène
        if(recoverable && scene) {
            recoverable.metadata = recoverable.metadata || {};
            recoverable.metadata.sceneTitle = scene.title;
        }
        
        state.data.shots = state.data.shots.filter(s => s.id !== shotId);
        History.log('DELETE', `Suppression plan storyboard : ${scene?.title || 'Scène inconnue'}`, {
            target: { kind: 'shot', id: shotId, label: scene?.title || 'Plan' },
            recoverable: recoverable
        });
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
        
        // Petit toast "Annuler" (8s) — voir undoDeleteShot ci-dessus
        Storyboard._lastDeletedShot = shot ? { shot: JSON.parse(JSON.stringify(shot)), index: shotIndex } : null;
        clearTimeout(Storyboard._lastDeletedShotTimer);
        const existingToast = document.getElementById('shot-undo-toast');
        if(existingToast) existingToast.remove();
        if(Storyboard._lastDeletedShot) {
            const container = document.getElementById('toast-container');
            if(container) {
                const toast = document.createElement('div');
                toast.id = 'shot-undo-toast';
                toast.className = 'toast info';
                toast.innerHTML = `
                    <span class="toast-icon">🗑️</span>
                    <span class="toast-message">Plan supprimé</span>
                    <button onclick="app.Storyboard.undoDeleteShot()" style="padding:3px 10px; background:var(--primary); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.85rem; margin-left:6px;">↩️ Annuler</button>
                    <button class="toast-close" onclick="this.parentElement.remove()">✖</button>
                `;
                container.appendChild(toast);
            }
            Storyboard._lastDeletedShotTimer = setTimeout(() => {
                Storyboard._lastDeletedShot = null;
                const t = document.getElementById('shot-undo-toast');
                if(t) t.remove();
            }, 8000);
        }
    },
    
    updateShot: (shotId, field, value) => {
        if(state.currentRole === 'viewer' || !Permissions.canEdit('storyboard')) return;
        
        const shot = state.data.shots.find(s => s.id === shotId);
        if(shot) {
            shot[field] = value;
            shot.lastModified = Date.now();
            Store.save();
        }
    },
    
    // ===================== IMAGES & OBJETS CANVAS =====================
    // Phase 3 Storyboard : dessine les objets vectoriels (emojis pré-remplis) sur un canvas context
    // Phase 4B : cache d'images SVG pour le rendu canvas
    // Convertir un SVG en Image() coûte ~5ms, donc on le fait une fois et on réutilise.
    // Map type → { img: HTMLImageElement, ready: boolean }
    _svgImageCache: {},
    
    // Phase 4B : retourne l'image SVG d'un type d'objet (lazy-loaded, déclenche redraw quand prête)
    // Stratégie :
    //  - Si déjà chargée : retourne l'image
    //  - Si en cours de chargement : retourne null (l'image apparaîtra au prochain redraw)
    //  - Si jamais demandée : lance le chargement et retourne null
    getOrCreateSvgImage: (type, color) => {
        // Clé de cache = type + couleur (au cas où on veut différentes couleurs plus tard)
        const cacheKey = type + '|' + (color || 'currentColor');
        let entry = Storyboard._svgImageCache[cacheKey];
        if(entry && entry.ready) return entry.img;
        if(entry && !entry.ready) return null;  // En cours de chargement
        
        // Trouver le SVG dans le catalogue
        const def = (CONFIG.annotationObjects || []).find(o => o.type === type);
        if(!def || !def.svg) return null;
        
        // Préparer le SVG : remplacer "currentColor" par la couleur souhaitée si fournie
        let svgString = def.svg;
        if(color && color !== 'currentColor') {
            svgString = svgString.replace(/currentColor/g, color);
        } else {
            // Par défaut, on utilise une couleur visible (noir ou blanc selon le contexte)
            svgString = svgString.replace(/currentColor/g, '#222');
        }
        
        // Phase 4B fix : certains navigateurs exigent xmlns sur la balise <svg> pour rendre
        // un blob SVG en image. On l'injecte si absent (compatibilité Firefox stricte).
        if(!svgString.includes('xmlns=')) {
            svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        }
        
        // Créer l'image et déclencher le chargement
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        Storyboard._svgImageCache[cacheKey] = { img: img, ready: false };
        
        img.onload = () => {
            Storyboard._svgImageCache[cacheKey].ready = true;
            URL.revokeObjectURL(url);
            // Déclencher un redraw pour afficher l'image maintenant qu'elle est prête
            // (DrawingEditor + Storyboard listings)
            try {
                if(typeof DrawingEditor !== 'undefined' && DrawingEditor.redraw) DrawingEditor.redraw();
                Storyboard.planifierRepeinteVignettes();
            } catch(_) { /* silent */ }
        };
        img.onerror = () => {
            console.warn('[Storyboard] Erreur chargement SVG pour type:', type);
            URL.revokeObjectURL(url);
            // Marquer comme prêt mais avec une image cassée pour éviter de re-tenter en boucle
            Storyboard._svgImageCache[cacheKey].ready = true;
            Storyboard._svgImageCache[cacheKey].failed = true;
        };
        img.src = url;
        
        return null;  // L'image n'est pas encore prête, retour null
    },
    
    // Phase 4B v2 : retourne l'image d'un objet de type 'image' (lazy-loaded)
    // Identique à getOrCreateSvgImage mais utilise imageData (data URL base64) au lieu d'un type SVG.
    // La clé du cache est l'ID de l'objet pour éviter d'utiliser le data URL géant comme clé.
    // v599 — REPEINTE DIFFEREE DES VIGNETTES. Une image-objet qui finit de
    // charger doit faire redessiner la liste des plans : sans cela, le
    // remplacant en pointilles dessine a sa place y reste POUR TOUJOURS.
    // Le declencheur existait, mais il etait garde par
    // « state.currentShotId === null ». Or state.currentShotId N'EXISTE PAS :
    // seuls DrawingEditor.currentShotId et ScriptReport.currentShotId sont
    // poses quelque part dans le code. La condition valait donc
    // undefined === null, soit FAUX en permanence, et la repeinte ne partait
    // JAMAIS. D'ou des miniatures vides jusqu'a ce qu'un autre evenement
    // redessine la liste — typiquement l'ouverture puis la fermeture d'une
    // fiche de plan, apres quoi toutes les images apparaissaient d'un coup.
    // La bonne condition est : ne pas redessiner la liste pendant qu'on EDITE
    // un plan. Et on coalesce, sinon dix images arrivant ensemble
    // provoqueraient dix redessins complets.
    _repeinteTimer: null,
    _repeintes: 0,
    planifierRepeinteVignettes: () => {
        // v599 : la condition « pas pendant l'edition d'un plan », ajoutee au
        // passage precedent, est retiree. Redessiner la liste pendant qu'une
        // fenetre de dessin est ouverte est sans consequence — elle vit dans
        // une autre partie de la page — alors qu'une condition de trop est un
        // frein possible de plus, et c'est exactement ce genre de garde qui
        // avait deja desactive cette repeinte en silence.
        if(!document.getElementById('sbShotsList')) return;
        if(Storyboard._repeinteTimer) return;
        Storyboard._repeinteTimer = setTimeout(() => {
            Storyboard._repeinteTimer = null;
            Storyboard._repeintes++;
            try { Storyboard.renderShots(); } catch(e) {}
        }, 120);
    },

    getOrCreateUploadedImage: (objectId, imageData) => {
        const cacheKey = 'uploaded|' + objectId;
        let entry = Storyboard._svgImageCache[cacheKey];
        if(entry && entry.ready) return entry.failed ? null : entry.img;
        if(entry && !entry.ready) return null;
        
        if(!imageData) return null;

        // v599 — NE PAS BRULER L'UNIQUE TENTATIVE. signedUrlFor rend le CHEMIN
        // BRUT tant que l'URL n'est pas signee. Le poser en src depuis une page
        // ouverte en local donne une adresse relative, qui echoue — et l'echec
        // etait memorise DEFINITIVEMENT (failed: true), si bien que l'image ne
        // s'affichait plus jamais, meme une fois la signature disponible. On
        // s'abstient donc, sans rien mettre en cache : le rendu suivant
        // reessaiera, cette fois avec une vraie URL.
        // v599 — DEUX CHEMINS, car le diagnostic a montre que l'URL signee
        // n'etait PAS disponible pour ces images : aucune entree n'apparaissait
        // dans le cache, et la liste n'etait jamais repeinte.
        //  1. URL directement utilisable (http, data:, blob:) -> on la pose ;
        //  2. sinon, si c'est un chemin de projet, on TELECHARGE le fichier par
        //     le SDK (authentifie, sans passer par une signature) et on dessine
        //     depuis une URL blob locale. C'est le meme chemin que celui des
        //     calques de dessin, qui eux s'affichaient correctement — d'ou
        //     l'idee de ne plus dependre de la signature ici non plus.
        // Rien d'exploitable du tout -> on rend null SANS mettre en cache, le
        // rendu suivant reessaiera (ne jamais bruler l'unique tentative).
        const chemin = Utils._projPathFrom(imageData);
        const url = Utils.signedUrlFor(imageData);
        // v599 — UNE URL DE MEDIA PROJET N'EST JAMAIS POSEE TELLE QUELLE.
        // Le bucket 'projects' est PRIVE : une adresse de forme
        // /object/public/ y est toujours refusee. Or signedUrlFor rend la
        // valeur stockee inchangee quand la signature n'est pas en cache — un
        // repli qui, ici, est garanti de rater. On brulait l'unique tentative
        // dessus, et l'image etait marquee ratee DEFINITIVEMENT.
        // Donc : media projet -> URL signee si le cache a repondu, sinon
        // telechargement par le SDK. Les autres adresses (data:, blob:, site
        // externe) restent posees directement.
        // v601 — UN MEDIA DE PROJET PASSE TOUJOURS PAR LE TELECHARGEMENT, PLUS
        // JAMAIS PAR L'URL SIGNEE. C'est ce qui empechait les images inserees
        // dans l'editeur de sortir a l'export, alors que les CALQUES de dessin
        // sortaient : les calques passent par _loadPrintImg, donc par une URL
        // blob de MEME ORIGINE ; les images-objets, elles, etaient posees depuis
        // l'URL signee du stockage, une autre origine.
        // Dessiner une image d'une autre origine dans un canvas ne rate PAS —
        // l'image s'affiche tres bien a l'ecran — mais elle SOUILLE le canvas :
        // le navigateur interdit ensuite d'en RELIRE le contenu. Or c'est
        // exactement ce que fait html2canvas pour fabriquer la page du PDF. D'ou
        // une planche vide, sans erreur visible, alors que la vignette de
        // l'onglet, elle, s'affichait parfaitement.
        // Une URL blob vient de la page elle-meme : elle ne souille rien.
        const utilisable = chemin
            ? false
            : (typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')));
        if(!utilisable && !chemin) return null;

        const img = new Image();
        // Adresse EXTERIEURE (image posee par un outil tiers) : on demande le
        // partage d'origine, sans quoi elle souillerait le canvas comme
        // ci-dessus. Si le serveur refuse, l'image ne se chargera pas du tout —
        // c'est un echec franc, prefere a une planche vide inexpliquee.
        if(utilisable && typeof url === 'string' && url.startsWith('http')) {
            img.crossOrigin = 'anonymous';
        }
        Storyboard._svgImageCache[cacheKey] = { img: img, ready: false };
        
        img.onload = () => {
            Storyboard._svgImageCache[cacheKey].ready = true;
            try {
                if(typeof DrawingEditor !== 'undefined' && DrawingEditor.redraw) DrawingEditor.redraw();
                Storyboard.planifierRepeinteVignettes();
            } catch(_) { /* silent */ }
        };
        img.onerror = () => {
            console.warn('[Storyboard] Erreur chargement image-objet pour id:', objectId);
            Storyboard._svgImageCache[cacheKey].ready = true;
            Storyboard._svgImageCache[cacheKey].failed = true;
        };
        if(utilisable) {
            img.src = url;
        } else {
            // Pas d'URL signee : on telecharge le fichier par le SDK et on
            // dessine depuis une URL blob locale — le chemin qui fonctionne
            // deja pour les calques de dessin.
            StoryboardExport._resolveBlobUrl(imageData).then(blobUrl => {
                if(blobUrl) { img.src = blobUrl; return; }
                // Telechargement impossible : on RETIRE l'entree plutot que de
                // la marquer ratee, pour laisser sa chance au rendu suivant.
                delete Storyboard._svgImageCache[cacheKey];
            }).catch(() => { delete Storyboard._svgImageCache[cacheKey]; });
        }
        
        return null;
    },
    
    // Phase 4B : rendu canvas des objets via SVG (avec fallback emoji si SVG pas encore chargé)
    // Chaque objet : { type, x, y, scale?, rotation? } — type doit correspondre à un CONFIG.annotationObjects[].type
    // v599 — DESSIN DES OBJETS IMAGE PAR LE CHEMIN EPROUVE.
    // Constat de l'utilisateur, decisif : « Mini Apercu » et « Apercu Plein
    // Ecran » affichent bien ces images. Or l'apercu passe par
    // StoryboardExport._loadPrintImg, qui telecharge les medias du bucket PRIVE
    // en blob via le SDK. Les vignettes, elles, passaient par
    // getOrCreateUploadedImage et son cache, qui dependait d'une URL signee —
    // et echouaient. Plutot que de continuer a reparer ce second chemin, on
    // reprend ici EXACTEMENT celui de l'apercu.
    // Le canvas est retrouve au moment de peindre (et non capture avant), pour
    // survivre a un redessin de la liste entre le depart du telechargement et
    // son arrivee. La transformation reproduit celle de renderObjectsOnCanvas :
    // translation au centre de l'objet, rotation, puis dessin centre.
    dessinerObjetsImage: (canvasId, objects) => {
        const images = (objects || []).filter(o => o && o.type === 'image' && o.imageData);
        if(!images.length || typeof StoryboardExport === 'undefined' || !StoryboardExport._loadPrintImg) return;
        images.forEach(obj => {
            const img = new Image();
            StoryboardExport._loadPrintImg(img, obj.imageData, () => {
                const c = document.getElementById(canvasId);
                if(!c) return;
                const ctx = c.getContext('2d');
                const scale = obj.scale || 1;
                const w = (obj.width || 100) * scale;
                const h = (obj.height || 100) * scale;
                ctx.save();
                ctx.translate(obj.x || 0, obj.y || 0);
                if(obj.rotation) ctx.rotate(obj.rotation * Math.PI / 180);
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                ctx.restore();
            });
        });
    },

    renderObjectsOnCanvas: (ctx, objects) => {
        if(!ctx || !Array.isArray(objects) || objects.length === 0) return;
        const catalog = CONFIG.annotationObjects || [];
        const baseSize = 48;  // Taille de référence d'un objet à scale=1 (en px sur canvas 800x600)
        
        objects.forEach(obj => {
            if(!obj || !obj.type) return;
            const def = catalog.find(d => d.type === obj.type);
            const x = obj.x || 0;
            const y = obj.y || 0;
            const scale = obj.scale || 1;
            const rotation = obj.rotation || 0;
            
            ctx.save();
            ctx.translate(x, y);
            if(rotation) ctx.rotate(rotation * Math.PI / 180);
            
            // Phase 4B v2 : type 'image' = objet image utilisateur (avec width/height natives stockées)
            if(obj.type === 'image') {
                const img = Storyboard.getOrCreateUploadedImage(obj.id, obj.imageData);
                if(img) {
                    const w = (obj.width || 100) * scale;
                    const h = (obj.height || 100) * scale;
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                } else {
                    // Image en cours de chargement : afficher un placeholder discret
                    ctx.strokeStyle = '#888';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    const w = (obj.width || 100) * scale;
                    const h = (obj.height || 100) * scale;
                    ctx.strokeRect(-w / 2, -h / 2, w, h);
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#888';
                    ctx.font = '12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('Chargement…', 0, 0);
                }
            } else {
                // Phase 4B : SVG en priorité, fallback emoji
                const size = baseSize * scale;
                const img = (def && def.svg) ? Storyboard.getOrCreateSvgImage(obj.type) : null;
                if(img) {
                    ctx.drawImage(img, -size / 2, -size / 2, size, size);
                } else {
                    const emoji = def ? def.emoji : '❓';
                    ctx.font = size + 'px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(emoji, 0, 0);
                }
            }
            
            ctx.restore();
        });
    },
    
    // Phase 1 Storyboard : inverse l'état de visibilité d'une zone sémantique sur un plan
    toggleDrawingVisibility: (shotId, kind) => {
        const validKinds = ['lighting', 'camera', 'actors'];
        if(!validKinds.includes(kind)) return;
        
        const shot = state.data.shots.find(s => s.id === shotId);
        if(!shot) return;
        
        // Si la zone est vide, ne rien faire (le bouton est désactivé visuellement)
        // Phase 4B v2 : aussi considérer la présence d'objets/images insérées comme une annotation
        const zone = shot.drawings && shot.drawings[kind];
        const hasPixels = !!(zone && (zone.drawingData || zone.imageUrl));
        const hasObjects = !!(zone && Array.isArray(zone.objects) && zone.objects.length > 0);
        if(!hasPixels && !hasObjects) {
            Utils.toast(`Aucune annotation ${kind} pour ce plan`, 'info');
            return;
        }
        
        if(!shot.drawingsVisibility) {
            shot.drawingsVisibility = { original: true, lighting: false, camera: false, actors: false };
        }
        shot.drawingsVisibility[kind] = !shot.drawingsVisibility[kind];
        
        Store.save();
        
        // Rafraîchir l'affichage : on re-render la grille storyboard et la modale d'édition si ouverte
        Storyboard.renderShots();
        if(Storyboard.currentEditingShotId === shotId) {
            Storyboard.refreshEditModal(shotId);
        }
    },
    
    chooseDrawing: (shotId) => {
        const menuEl = document.getElementById('image-menu-modal');
        if(menuEl) menuEl.remove();
        // v616 : plus de callback ici. Avec un callback, DrawingEditor.close()
        // prenait la branche "retourner l'image via callback" (prévue pour le
        // Mood Board) au lieu de committer le dessin par calques — le callback
        // ne faisait qu'un rafraîchissement d'affichage, sans jamais écrire
        // shot.drawings. Un calque supprimé n'était donc RÉELLEMENT retiré
        // nulle part : à la réouverture, l'ancien dessin revenait toujours.
        // Sans callback, close() reconnaît qu'on est dans "Édition Plan" (via
        // Storyboard.currentEditingShotId) et committe correctement.
        DrawingEditor.open(shotId, null, 'original');
    },
    
    // Phase 1 Storyboard : ouvre l'éditeur sur une zone sémantique (lumière/caméra/acteurs)
    // Phase 2 Storyboard : vérifie la permission storyboard_<kind> avant d'ouvrir
    chooseAnnotation: (shotId, kind) => {
        const menuEl = document.getElementById('image-menu-modal');
        if(menuEl) menuEl.remove();
        
        const validKinds = ['lighting', 'camera', 'actors'];
        if(!validKinds.includes(kind)) return;
        
        // Phase 2 : vérification de permission avant ouverture
        const permKey = 'storyboard_' + kind;
        if(state.currentRole !== 'owner' && !Permissions.canEdit(permKey)) {
            const labels = { lighting: 'Lumière', camera: 'Caméra', actors: 'Acteurs' };
            Utils.toast(`Permission insuffisante pour éditer la zone ${labels[kind]}.`, 'error');
            return;
        }
        
        // Activer automatiquement la visibilité de cette zone après édition
        const shot = state.data.shots.find(s => s.id === shotId);
        if(shot) {
            if(!shot.drawingsVisibility) {
                shot.drawingsVisibility = { original: true, lighting: false, camera: false, actors: false };
            }
            shot.drawingsVisibility[kind] = true;
        }
        
        // v616 : voir le commentaire de chooseDrawing ci-dessus — plus de callback.
        DrawingEditor.open(shotId, null, kind);
    },
    
    // ===================== MODALE D'ÉDITION DE PLAN =====================
    currentEditingShotId: null,
    
    openEditModal: (shotId) => {
        // 31 aout — meme correction que la fiche Ressource : le refus sec
        // « viewer » empechait de REGARDER un plan. On ouvre, et c'est le droit
        // de la section Storyboard qui decide si l'on peut y ecrire.
        if(typeof Permissions !== 'undefined' && Permissions.canOpenFiche && !Permissions.canOpenFiche('shot')) return;
        const roShot = (typeof Permissions !== 'undefined' && Permissions.canEditFiche)
            ? !Permissions.canEditFiche('shot') : (state.currentRole === 'viewer');
        
        Storyboard.currentEditingShotId = shotId;
        const shot = state.data.shots.find(s => s.id === shotId);
        if(!shot) return;
        
        const sceneIndex = state.data.scenes.findIndex(s => s.id === shot.sceneId) + 1;
        const shotIndex = state.data.shots.filter(s => s.sceneId === shot.sceneId && s.order <= shot.order).length;
        
        document.getElementById('shotEditTitle').innerText = roShot
            ? `\u{1F441} Plan ${sceneIndex}.${shotIndex} (lecture seule)`
            : `Édition Plan ${sceneIndex}.${shotIndex}`;
        
        const content = document.getElementById('shotEditContent');
        content.innerHTML = Storyboard.createShotCard(shot, shotIndex - 1).innerHTML;
        // Verrou visuel + bouton de sauvegarde masque : un bouton qui ne peut
        // rien enregistrer vaut mieux cache qu'affiche.
        content.classList.add('perm-ro-scope');
        content.classList.toggle('is-perm-readonly', roShot);
        const saveBtn = document.getElementById('shotEditSaveBtn');
        if(saveBtn) saveBtn.style.display = roShot ? 'none' : '';
        
        // Setup change detection
        content.querySelectorAll('input, textarea, select').forEach(input => {
            input.addEventListener('change', () => {
                Storyboard.markAsDirty();
            });
        });
        
        document.getElementById('shot-edit-modal').classList.add('active');
    },
    
    closeEditModal: async () => {
        const saveBtn = document.getElementById('shotEditSaveBtn');
        
        if(saveBtn.classList.contains('visible')) {
            if(!await ConfirmModal.show({ title: 'Modifications non sauvegardées', message: 'Vous avez des modifications non sauvegardées.\n\nFermer quand même ?', icon: '⚠️', dangerous: true, confirmText: 'Fermer sans sauvegarder', cancelText: 'Annuler' })) {
                return;
            }
        }
        
        document.getElementById('shot-edit-modal').classList.remove('active');
        Storyboard.currentEditingShotId = null;
        Storyboard.renderShots();
    },
    
    refreshEditModal: (shotId) => {
        const shot = state.data.shots.find(s => s.id === shotId);
        if(!shot) return;
        
        const sceneIndex = state.data.scenes.findIndex(s => s.id === shot.sceneId) + 1;
        const shotIndex = state.data.shots.filter(s => s.sceneId === shot.sceneId && s.order <= shot.order).length;
        
        const content = document.getElementById('shotEditContent');
        content.innerHTML = Storyboard.createShotCard(shot, shotIndex - 1).innerHTML;
        
        // Re-setup change detection
        content.querySelectorAll('input, textarea, select').forEach(input => {
            input.addEventListener('change', () => {
                Storyboard.markAsDirty();
            });
        });
    },
    
    markAsDirty: () => {
        const shot = state.data.shots.find(s => s.id === Storyboard.currentEditingShotId);
        if(shot) {
            shot.isDirty = true;
        }
        
        document.getElementById('shotEditSaveBtn').classList.add('visible');
    },
    
    saveCurrentShot: () => {
        // Griser n'est qu'un affichage : l'enregistrement verifie lui aussi.
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('shot')) {
            Utils.toast("Vous n'avez pas les droits de modification sur le storyboard.", 'error');
            return;
        }
        const shot = state.data.shots.find(s => s.id === Storyboard.currentEditingShotId);
        if(!shot) return;
        
        shot.isDirty = false;
        shot.lastModified = Date.now();
        
        Store.save();
        
        document.getElementById('shotEditSaveBtn').classList.remove('visible');
        
        Utils.toast('Plan sauvegardé !', 'success');
        
        Storyboard.closeEditModal();
    },
	
	// ===================== VUES & CONFIG D'IMPRESSION =====================
	currentView: 'edit',
    printConfig: {
        layout: 'standard',
        shotNumber: true,
        shotType: true,
        cameraMove: true,
        cameraMode: true,
        description: true,
        actorDirection: true,
        techDirection: true,
        sceneTitle: true,
        techLayer: 'none' // [Phase C.2.6] 'none' | 'lighting' | 'camera' | 'actors'
    },
    
    // Extraire l'acronyme entre parenthèses, ex: "Gros plan (GP)" → "GP"
    extractAcronym: (value) => {
        if(!value) return '';
        const match = value.match(/\(([^)]+)\)/);
        return match ? match[1] : value;
    },
    
    switchView: (view) => {
        Storyboard.currentView = view;
        
        document.querySelectorAll('.sb-toggle-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        if(view === 'edit') {
            document.getElementById('sbEditView').style.display = 'flex';
            document.getElementById('sbPrintPreview').classList.remove('active');
        } else if(view === 'preview') {
            document.getElementById('sbEditView').style.display = 'none';
            document.getElementById('sbPrintPreview').classList.add('active');
            Storyboard.renderPrintPreview('sbPrintPreview');
        }
    },
    
    // Modale d'options d'export (meme modele que les autres onglets) : page de
    // garde + mise en page + calque technique + choix des scenes + Generer.
    // Renvoie vers le hub d'export global (Fichier > Export), en ne cochant que
    // la section Storyboard : un clic ici garde le geste "export rapide de cet
    // onglet" d'avant, sans dupliquer la fenêtre d'options du hub.
    openPdfModal: () => {
        const shots = state.data.shots || [];
        if(shots.length === 0) { Utils.toast('Aucun plan à exporter', 'warning'); return; }
        Actions.openExportModal('storyboard');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'storyboard');
        });
    },
    
    openFullscreen: () => {
        document.getElementById('sbFullscreenModal').classList.add('active');
        Storyboard.renderPrintPreview('sbFullscreenContent');
    },
    
    closeFullscreen: () => {
        document.getElementById('sbFullscreenModal').classList.remove('active');
    },
    
    // ===================== IMPRESSION & EXPORT (délégué à StoryboardExport) =====================
    renderPrintPreview: (...a) => StoryboardExport.renderPrintPreview(...a),
    _drawTechLayerOnTop: (...a) => StoryboardExport._drawTechLayerOnTop(...a),
    createPrintShot: (...a) => StoryboardExport.createPrintShot(...a),
    exportPDF: (...a) => StoryboardExport.exportPDF(...a),
};

const StoryboardExport = {
    _printCapturing: false,
    _printImgPromises: [],
    _exportSceneIds: null, // null = toutes ; sinon liste d'ids de scenes a exporter

    // [Fix images PDF] Telecharge les octets de l'image via le client Supabase
    // (deja autorise cote CORS) et renvoie une URL blob locale (same-origin).
    // Utilise seulement pour les images STOCKEES (chemin projet). Les images en
    // data: URL (cas courant du storyboard) sont dessinees directement.
    // ===== CACHE DES BLOBS DE DESSIN (v599) =====
    // Les dessins du storyboard ne passent PAS par le cache d'images du
    // navigateur : ils sont telecharges en blob par le SDK. Or l'URL blob
    // etait revoquee juste apres avoir ete dessinee — chaque rendu de la liste
    // des plans retelechargeait donc TOUT, et les vignettes restaient vides le
    // temps des telechargements. C'est ce qui donnait l'impression que les
    // images n'apparaissaient qu'apres avoir ouvert puis referme une fiche :
    // le second rendu, lui, retrouvait la reponse dans le cache HTTP.
    // On garde donc les URL blob, bornees et videes au changement de projet.
    _blobCache: new Map(),
    _blobEnCours: new Map(),
    // v601 — ON MESURE EN OCTETS, PAS EN NOMBRE D'IMAGES. « 150 images » ne
    // veut rien dire : 150 vignettes de 50 Ko pesent 7 Mo, 150 planches de 2 Mo
    // en pesent 300. C'est le poids qui fait ramer le navigateur, c'est donc le
    // poids qu'on borne. Le nombre reste en second garde-fou, pour qu'un projet
    // fait de minuscules images n'accumule pas des milliers d'entrees.
    BLOB_CACHE_OCTETS: 50 * 1024 * 1024,
    BLOB_CACHE_MAX: 400,
    _blobPoids: new Map(),   // chemin -> octets
    _blobTotal: 0,

    // VRAI CLASSEMENT PAR USAGE. Avant, on jetait la plus ANCIENNEMENT CHARGEE
    // — qui pouvait etre celle qu'on regarde tout le temps, pendant qu'une
    // image jamais revue restait. Une Map garde l'ordre d'insertion : reposer
    // une entree deja presente la remet donc en queue, et le premier element
    // est bien le moins recemment SERVI.
    _blobToucher: (path) => {
        const c = StoryboardExport._blobCache;
        if(!c.has(path)) return;
        const u = c.get(path);
        c.delete(path);
        c.set(path, u);
    },

    _blobFaireDeLaPlace: () => {
        const c = StoryboardExport._blobCache;
        while(c.size && (StoryboardExport._blobTotal > StoryboardExport.BLOB_CACHE_OCTETS
                         || c.size > StoryboardExport.BLOB_CACHE_MAX)) {
            const vieux = c.keys().next().value;
            const u = c.get(vieux);
            c.delete(vieux);
            StoryboardExport._blobTotal -= (StoryboardExport._blobPoids.get(vieux) || 0);
            StoryboardExport._blobPoids.delete(vieux);
            try { URL.revokeObjectURL(u); } catch(e) {}
        }
        if(StoryboardExport._blobTotal < 0) StoryboardExport._blobTotal = 0;
    },

    // A taper dans la console : combien de place prennent les dessins gardes.
    blobInfo: () => ({
        images: StoryboardExport._blobCache.size,
        poids_mo: +(StoryboardExport._blobTotal / 1048576).toFixed(2),
        plafond_mo: +(StoryboardExport.BLOB_CACHE_OCTETS / 1048576).toFixed(0)
    }),

    // ---- FILE D'ATTENTE DES TELECHARGEMENTS (v601) ----
    // Une planche de storyboard peint ses dessins dans un CANVAS : il n'y a pas
    // de balise image, donc rien que le navigateur puisse mettre en file. Tout
    // partait d'un coup — une douzaine de pages a quatre plans font une
    // cinquantaine de telechargements simultanes — et chacun avait 8 secondes
    // pour repondre. Passe ce delai on dessine quand meme : d'ou des vignettes
    // VIDES, sans la moindre erreur affichee. Le mood board n'a jamais eu le
    // probleme parce qu'il passe par des balises image, que le navigateur
    // limite lui-meme a quelques connexions.
    // QUATRE A LA FOIS, donc, comme le ferait le navigateur.
    TELECHARGEMENTS_PARALLELES: 4,
    _imagesRatees: 0,
    _enVol: 0,
    _fileAttente: [],
    _place: () => new Promise(libre => {
        if(StoryboardExport._enVol < StoryboardExport.TELECHARGEMENTS_PARALLELES) {
            StoryboardExport._enVol++;
            libre();
        } else {
            StoryboardExport._fileAttente.push(libre);
        }
    }),
    _rendLaPlace: () => {
        const suivant = StoryboardExport._fileAttente.shift();
        if(suivant) suivant();
        else StoryboardExport._enVol = Math.max(0, StoryboardExport._enVol - 1);
    },
    videBlobCache: () => {
        StoryboardExport._blobPoids.clear();
        StoryboardExport._blobTotal = 0;
        StoryboardExport._blobCache.forEach(u => { try { URL.revokeObjectURL(u); } catch(e) {} });
        StoryboardExport._blobCache.clear();
        StoryboardExport._blobEnCours.clear();
    },
    _resolveBlobUrl: async (storedUrl) => {
        try {
            const path = Utils._projPathFrom(storedUrl);
            if(!path) return null;
            const cache = StoryboardExport._blobCache;
            const dejaLa = cache.get(path);
            if(dejaLa) { StoryboardExport._blobToucher(path); return dejaLa; }
            // Deux vignettes peuvent demander le meme dessin en meme temps :
            // sans cela, on le telechargerait deux fois.
            const enCours = StoryboardExport._blobEnCours.get(path);
            if(enCours) return enCours;
            const p = (async () => {
                await StoryboardExport._place();
                let data = null, error = null;
                try { ({ data, error } = await supabase.storage.from('projects').download(path)); }
                finally { StoryboardExport._rendLaPlace(); }
                if(error || !data) { console.warn('[Storyboard] telechargement echoue :', path, error); return null; }
                const url = URL.createObjectURL(data);
                cache.set(path, url);
                StoryboardExport._blobPoids.set(path, data.size || 0);
                StoryboardExport._blobTotal += (data.size || 0);
                StoryboardExport._blobFaireDeLaPlace();
                return url;
            })();
            StoryboardExport._blobEnCours.set(path, p);
            const r = await p;
            StoryboardExport._blobEnCours.delete(path);
            return r;
        } catch(e) { StoryboardExport._blobEnCours.delete(Utils._projPathFrom(storedUrl)); return null; }
    },

    // Charge une image de print puis appelle draw(). Regles :
    //  - data:/blob: -> utilisee TELLE QUELLE (surtout PAS de cache-buster, qui
    //    corromprait la data URL et ferait echouer le chargement) ;
    //  - chemin de stockage -> telecharge en blob (same-origin, insensible au CORS) ;
    //  - autre URL -> URL signee.
    // Si une capture PDF est en cours, la promesse est trackee pour qu'exportPDF
    // attende le dessin reel avant de rasteriser.
    _loadPrintImg: (img, storedUrl, draw) => {
        const isData = typeof storedUrl === 'string' && (storedUrl.startsWith('data:') || storedUrl.startsWith('blob:'));
        const resolve = isData ? Promise.resolve(null) : StoryboardExport._resolveBlobUrl(storedUrl);
        const p = resolve.then(objUrl => new Promise(res => {
            // v599 : plus de revocation ici. L'URL blob vient desormais du cache
            // ci-dessus et sert a tous les rendus suivants ; la detruire apres le
            // premier dessin etait la cause du retelechargement systematique.
            // TRACE NOMMEE (v601). Une vignette vide ne disait RIEN : ni erreur,
            // ni message, la page sortait juste blanche. On nomme desormais ce
            // qui n'a pas pu etre dessine, et pourquoi — c'est la seule chose
            // qu'on puisse lire apres coup quand le defaut ne se reproduit pas.
            let fait = false;
            const fini = (pourquoi) => {
                if(fait) return;
                fait = true;
                if(pourquoi) { StoryboardExport._imagesRatees++; console.warn('[Storyboard] image non dessinee (' + pourquoi + ') :', storedUrl); }
                res();
            };
            img.onload = () => { try { draw(); } catch(e) { console.warn('[Storyboard] dessin impossible :', e); } fini(); };
            img.onerror = () => fini('chargement refuse');
            img.src = objUrl || (isData ? storedUrl : Utils.signedUrlFor(storedUrl));
            setTimeout(() => fini('delai depasse (8 s)'), 8000);
        }));
        if(StoryboardExport._printCapturing) StoryboardExport._printImgPromises.push(p);
        return p;
    },
    
    renderPrintPreview: (containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        if(!state.data.shots || state.data.shots.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #999; padding: 50px;">Aucun plan à afficher</div>';
            return;
        }
        
        // Group shots by scene
        const onlyScenes = StoryboardExport._exportSceneIds; // null = toutes (apercu ecran)
        const sceneGroups = {};
        state.data.scenes.forEach(scene => {
            if(onlyScenes && !onlyScenes.includes(scene.id)) return;
            const sceneShots = state.data.shots
                .filter(s => s.sceneId === scene.id)
                .sort((a, b) => a.order - b.order);
            
            if(sceneShots.length > 0) {
                sceneGroups[scene.id] = {
                    scene: scene,
                    shots: sceneShots
                };
            }
        });
        
        // Calcul plage de scènes pour titre PDF
        const sceneNums = Object.values(sceneGroups).map(g => state.data.scenes.indexOf(g.scene) + 1);
        Storyboard._printSceneRange = sceneNums.length === 0 ? '' : (sceneNums.length === 1 ? `Sc ${sceneNums[0]}` : `Sc ${Math.min(...sceneNums)} à ${Math.max(...sceneNums)}`);
        // Render pages — flux continu : chaque page est remplie jusqu'à perPage plans,
        // toutes scènes confondues (fini les pages quasi vides à 1-2 plans). Un bandeau
        // de scène est inséré dans le flux à chaque changement de scène.
        const layout = (Storyboard.printConfig && Storyboard.printConfig.layout) || 'standard';
        const perPage = layout === 'large' ? 1 : (layout === 'compact' ? 16 : 4);
        let page = null, grid = null, used = 0;
        const newPage = () => {
            page = document.createElement('div');
            page.className = 'sb-print-page sb-print-page--' + layout;
            grid = document.createElement('div');
            grid.className = 'sb-print-grid';
            page.appendChild(grid);
            container.appendChild(page);
            used = 0;
        };
        const addSceneTitle = (sceneIndex, scene, suite) => {
            if(!Storyboard.printConfig.sceneTitle) return;
            const h = document.createElement('h2');
            h.innerText = `Scène ${sceneIndex} - ${scene.title}` + (suite ? ' (suite)' : '');
            if(layout === 'large') page.insertBefore(h, grid);
            else grid.appendChild(h);
        };
        newPage();
        Object.values(sceneGroups).forEach(group => {
            const { scene, shots } = group;
            const sceneIndex = state.data.scenes.indexOf(scene) + 1;
            let titled = false;
            shots.forEach((shot, idx) => {
                if(used >= perPage) { newPage(); titled = false; }
                if(!titled) { addSceneTitle(sceneIndex, scene, idx > 0); titled = true; }
                grid.appendChild(Storyboard.createPrintShot(shot, sceneIndex, idx + 1));
                used++;
            });
        });
    },
    
    // v595 : précharge (et attend) les images des objets (photos insérées,
    // icônes SVG d'annotation) avant de les dessiner sur un canvas d'export.
    // Sans ça, renderObjectsOnCanvas dessine un placeholder "Chargement…" si
    // l'image n'est pas déjà en cache — placeholder qui reste figé dans le
    // PDF puisque ce canvas hors-écran n'est jamais redessiné après coup.
    _preloadObjectImages: (objects) => {
        if(!Array.isArray(objects) || objects.length === 0) return Promise.resolve();
        const catalog = CONFIG.annotationObjects || [];
        const waits = [];
        objects.forEach(o => {
            if(!o || !o.type) return;
            let cacheKey, trigger;
            if(o.type === 'image') {
                if(!o.imageData) return;
                cacheKey = 'uploaded|' + o.id;
                trigger = () => Storyboard.getOrCreateUploadedImage(o.id, o.imageData);
            } else {
                const def = catalog.find(d => d.type === o.type);
                if(!def || !def.svg) return; // pas de SVG -> fallback emoji, rien à précharger
                cacheKey = o.type + '|currentColor';
                trigger = () => Storyboard.getOrCreateSvgImage(o.type);
            }
            const existing = Storyboard._svgImageCache[cacheKey];
            if(existing && existing.ready) return;
            trigger();
            waits.push(new Promise(resolve => {
                const check = () => {
                    const entry = Storyboard._svgImageCache[cacheKey];
                    if(entry && entry.ready) { resolve(); return; }
                    setTimeout(check, 60);
                };
                check();
                setTimeout(resolve, 8000);
            }));
        });
        return Promise.all(waits);
    },
    
    // [Phase C.2.6] Helper : dessine un calque technique (lighting/camera/actors) PAR-DESSUS un canvas
    // existant. Utilisé par createPrintShot pour superposer dans un seul canvas (pas 2 séparés).
    _drawTechLayerOnTop: async (ctx, shot, techLayer, wantsTechLayer) => {
        if(!wantsTechLayer || !shot.drawings || !shot.drawings[techLayer]) return;
        const techZone = shot.drawings[techLayer];
        
        // 3 cas : image uploadée, drawingData (calques de dessin), objects (objets vectoriels)
        if(techZone.imageType === 'upload' && techZone.imageUrl) {
            const layerImg = new Image();
            await StoryboardExport._loadPrintImg(layerImg, techZone.imageUrl, () => { ctx.drawImage(layerImg, 0, 0, ctx.canvas.width, ctx.canvas.height); });
        } else if(techZone.drawingData) {
            // Dessine les calques DrawingEditor du zone tech par dessus (renderDrawingData fait drawImage async)
            DrawingEditor.renderDrawingData(ctx, techZone.drawingData);
        }
        
        // Objets vectoriels du zone tech par-dessus — attend que leurs images soient prêtes
        if(Array.isArray(techZone.objects) && techZone.objects.length > 0) {
            await StoryboardExport._preloadObjectImages(techZone.objects);
            Storyboard.renderObjectsOnCanvas(ctx, techZone.objects);
        }
    },
    
    createPrintShot: (shot, sceneIndex, shotIndex) => {
        const card = document.createElement('div');
        card.className = 'sb-print-shot';
        const imageOnlyMode = !!(Storyboard.printConfig && Storyboard.printConfig.imageOnly);
        
        // Mode "image uniquement" : pas de colonne d'info à côté (elle resterait
        // vide) — l'image prend toute la largeur, avec juste le titre/numéro
        // du plan au-dessus, sur une ligne fine.
        if(imageOnlyMode) {
            card.classList.add('sb-print-shot--imageonly');
            const headerParts = [];
            if(Storyboard.printConfig.shotNumber) headerParts.push(`<strong>Plan ${sceneIndex}.${shotIndex}</strong>`);
            if(shot.name) headerParts.push(Utils.escape(shot.name));
            if(headerParts.length > 0) {
                const topHeader = document.createElement('div');
                topHeader.className = 'sb-print-shot-header sb-print-shot-header--top';
                topHeader.innerHTML = headerParts.join(' - ');
                card.appendChild(topHeader);
            }
        }
        
        // Image
        const imageDiv = document.createElement('div');
        imageDiv.className = 'sb-print-shot-image';
        
        // [Phase C.2.6] Tout est rendu dans UN SEUL canvas pour garantir la superposition
        // (l'ancien système avec 2 canvas overlay s'imprimait côte à côte au lieu de superposé)
        const techLayer = (Storyboard.printConfig && Storyboard.printConfig.techLayer) || 'none';
        const wantsTechLayer = (techLayer !== 'none');
        
        const composedCanvas = document.createElement('canvas');
        composedCanvas.width = 800;
        composedCanvas.height = 600;
        const composedCtx = composedCanvas.getContext('2d');
        let hasContent = false;
        
        // ====================================================================
        // DEUX RANGEMENTS, ET L'EXPORT N'EN LISAIT QU'UN (v601)
        // ====================================================================
        // Un plan peut porter son image a DEUX endroits :
        //   - A LA RACINE (shot.imageType / imageUrl / drawingData) : l'ancien
        //     format, celui que la vignette de l'onglet lit encore ;
        //   - DANS LA ZONE « original » (shot.drawings.original) : le format des
        //     quatre calques, celui que l'EDITEUR DE DESSIN ecrit depuis qu'il
        //     existe. Une image inseree dans l'editeur y devient un OBJET
        //     (objects[]), pas une imageUrl.
        // L'export ne lisait que la RACINE, et pire : il n'allait chercher les
        // objets de la zone QUE si la racine portait deja un drawingData. Un plan
        // dessine ou illustre uniquement dans l'editeur n'avait donc aucune de ces
        // deux conditions — « Pas d'image », page blanche, et pas la moindre
        // erreur pour le dire.
        // On compose desormais dans l'ordre naturel : image de fond (racine OU
        // zone), calques de dessin (zone d'abord, racine en repli), puis objets.
        // L'EDITEUR GAGNE, ET C'EST TOUTE LA REGLE (v601). Un plan peut porter une
        // image a la RACINE (ancien format, souvent une esquisse de depart) ET un
        // contenu dans la zone « original », celle qu'ecrit l'editeur de dessin.
        // Les composer tous les deux faisait reapparaitre l'esquisse EN FOND,
        // derriere le travail reel, des que celui-ci ne couvrait pas tout le
        // cadre. Des que la zone a quelque chose a elle — un calque, un objet, une
        // image — elle est la SEULE source ; la racine ne sert plus que de repli
        // pour les plans jamais ouverts dans l'editeur.
        // RIEN N'EST EFFACE : l'ancienne image dort dans les donnees et
        // reapparaitrait si on vidait la zone. On choisit ce qu'on REGARDE, pas
        // ce qu'on garde.
        const contenu = Storyboard.contenuPlan(shot);
        const fondUrl = contenu.fond;
        const calques = contenu.calques;
        const objets = contenu.objets;

        if(fondUrl || calques || objets.length > 0) {
            let etape = Promise.resolve();
            if(fondUrl) {
                const img = new Image();
                etape = StoryboardExport._loadPrintImg(img, fondUrl, () => {
                    // Garder l'aspect ratio : dessiner centre dans le canvas
                    const ratio = Math.min(composedCanvas.width / img.naturalWidth, composedCanvas.height / img.naturalHeight);
                    const w = img.naturalWidth * ratio;
                    const h = img.naturalHeight * ratio;
                    composedCtx.drawImage(img, (composedCanvas.width - w) / 2, (composedCanvas.height - h) / 2, w, h);
                });
            }
            if(calques) etape = etape.then(() => DrawingEditor.renderDrawingData(composedCtx, calques) || Promise.resolve());
            if(objets.length > 0) {
                etape = etape.then(() => StoryboardExport._preloadObjectImages(objets))
                             .then(() => Storyboard.renderObjectsOnCanvas(composedCtx, objets));
            }
            const techP = etape.then(() => Storyboard._drawTechLayerOnTop(composedCtx, shot, techLayer, wantsTechLayer));
            if(StoryboardExport._printCapturing) StoryboardExport._printImgPromises.push(techP);
            hasContent = true;
        }


if(hasContent) {
            imageDiv.appendChild(composedCanvas);
        } else {
            imageDiv.innerHTML = '<div style="color: #999;">Pas d\'image</div>';
        }
        
        card.appendChild(imageDiv);
        
        if(imageOnlyMode) return card;
        
        // Info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'sb-print-shot-info';
        
        let infoHTML = '';
        
        // Header line
        const headerParts = [];
        if(Storyboard.printConfig.shotNumber) {
            headerParts.push(`<strong>Plan ${sceneIndex}.${shotIndex}</strong>`);
        }
        if(shot.name) {
            headerParts.push(shot.name);
        }
        if(headerParts.length > 0) {
            infoHTML += `<div class="sb-print-shot-header">${headerParts.join(' - ')}</div>`;
        }
        
        // Meta line (avec acronymes)
        const metaParts = [];
        if(Storyboard.printConfig.shotType && shot.shotType) {
            metaParts.push(Storyboard.extractAcronym(shot.shotType));
        }
        if(Storyboard.printConfig.cameraMove && shot.cameraMove) {
            metaParts.push(Storyboard.extractAcronym(shot.cameraMove));
        }
        if(Storyboard.printConfig.cameraMode && shot.cameraMode) {
            metaParts.push(Storyboard.extractAcronym(shot.cameraMode));
        }
        if(metaParts.length > 0) {
            infoHTML += `<div class="sb-print-shot-meta">${metaParts.join(' • ')}</div>`;
        }
        
        // Description section
        if(Storyboard.printConfig.description && shot.description) {
            infoHTML += `<div class="sb-print-shot-desc"><strong>Description :</strong> ${Utils.escape(shot.description)}</div>`;
        }
        
        if(Storyboard.printConfig.actorDirection && shot.actorDirection) {
            infoHTML += `<div class="sb-print-shot-desc"><strong>Direction acteurs :</strong> ${Utils.escape(shot.actorDirection)}</div>`;
        }
        
        if(Storyboard.printConfig.techDirection && shot.technicalDirection) {
            infoHTML += `<div class="sb-print-shot-desc"><strong>Direction technique :</strong> ${Utils.escape(shot.technicalDirection)}</div>`;
        }
        
        infoDiv.innerHTML = infoHTML;
        card.appendChild(infoDiv);
        
        return card;
    },
    
    // ========== EXPORT PDF STORYBOARD ==========
    // opts = { includeCover, returnBlob, imageOnly, techLayer ('none'|'lighting'|'camera'|'actors') }
    // [Phase D refonte v2] Export Storyboard par rasterisation HORS-ÉCRAN
    // - Utilise renderPrintPreview qui sait déjà rendre toutes les pages
    // - html2canvas rasterise chaque page (.sb-print-page)
    // - Marche depuis n'importe quel onglet, capture images + calques techniques
    exportPDF: async (opts = {}) => {
        const shots = state.data.shots || [];
        
        if(shots.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucun plan à exporter', 'warning');
            return;
        }
        
        if(!opts.returnBlob) Utils.toast('Génération du PDF Storyboard...', 'info');
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        
        if(typeof html2canvas === 'undefined') {
            Utils.toast('html2canvas non chargé', 'error');
            return;
        }
        const projectTitle = state.data.title || 'Projet sans titre';
        const cleanT = (t) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');
        
        // ===== 1. Créer un container HORS-ÉCRAN pour rendre les pages HTML =====
        const offscreen = document.createElement('div');
        offscreen.id = 'storyboardOffscreenPreview';
        offscreen.style.position = 'absolute';
        offscreen.style.left = '-99999px';
        offscreen.style.top = '0';
        offscreen.style.pointerEvents = 'none';
        offscreen.style.background = 'white';
        // Largeur cohérente avec le CSS de .sb-print-page (max-width: 210mm = 794px à 96dpi)
        offscreen.style.width = '794px';
        document.body.appendChild(offscreen);
        
        // ===== 2. Appeler renderPrintPreview qui sait déjà tout rendre =====
        // [Modal Export global] opts.imageOnly / opts.techLayer surchargent temporairement
        // printConfig le temps du rendu (sans opts, la config du panneau de l'onglet s'applique)
        const prevPrintConfig = Storyboard.printConfig;
        if(opts.imageOnly || opts.techLayer !== undefined || opts.layout !== undefined) {
            const pc = { ...prevPrintConfig };
            if(opts.techLayer !== undefined) pc.techLayer = opts.techLayer;
            if(opts.layout !== undefined) pc.layout = opts.layout;
            if(opts.imageOnly) {
                pc.imageOnly = true;
                pc.shotType = false;
                pc.cameraMove = false;
                pc.cameraMode = false;
                pc.description = false;
                pc.actorDirection = false;
                pc.techDirection = false;
            } else if(opts.layout !== undefined) {
                // Même règle que l'ancien modal dédié : mise en page "Compact" = infos minimales.
                const fullText = (opts.layout === 'standard' || opts.layout === 'large');
                pc.imageOnly = false;
                pc.shotNumber = true;
                pc.shotType = true;
                pc.cameraMove = true;
                pc.cameraMode = true;
                pc.description = fullText;
                pc.actorDirection = fullText;
                pc.techDirection = fullText;
                pc.sceneTitle = true;
            }
            Storyboard.printConfig = pc;
        }
        StoryboardExport._printCapturing = true;
        StoryboardExport._printImgPromises = [];
        StoryboardExport._imagesRatees = 0;
        StoryboardExport._exportSceneIds = (opts.sceneIds && opts.sceneIds.length) ? opts.sceneIds : null;
        try {
            Storyboard.renderPrintPreview('storyboardOffscreenPreview');
        } catch(e) {
            console.warn('[Storyboard PDF] Échec renderPrintPreview:', e);
            Storyboard.printConfig = prevPrintConfig;
            StoryboardExport._exportSceneIds = null;
            try { document.body.removeChild(offscreen); } catch(_) {}
            return;
        }
        Storyboard.printConfig = prevPrintConfig;
        StoryboardExport._exportSceneIds = null;
        
        // Laisser le temps au DOM de se mettre à jour ET aux images async
        await new Promise(r => setTimeout(r, 600));
        
        // Attendre toutes les images du container
        const allImgs = offscreen.querySelectorAll('img');
        await Promise.all(Array.from(allImgs).map(img => {
            if(img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(() => resolve(), 5000);
            });
        }));
        // [2b] Attendre le dessin reel de toutes les images de print (calques, image
        // televersee, calque technique) avant la rasterisation : les canvas sont
        // peints via img.onload async, un delai fixe ne suffit pas — sans ca les
        // vignettes ressortent vides.
        // ON VIDE LA FILE, ON NE LA PHOTOGRAPHIE PAS (v601). Promise.all fige la
        // liste au moment de l'appel ; or un dessin a plusieurs CALQUES n'empile le
        // deuxieme qu'une fois le premier telecharge, donc APRES cette photo. Les
        // calques suivants n'etaient pas attendus, et une planche a deux calques
        // pouvait partir a moitie peinte. On recommence tant que la file grossit.
        try {
            for(let tour = 0; tour < 12; tour++) {
                const enCours = StoryboardExport._printImgPromises.slice();
                if(!enCours.length) break;
                await Promise.all(enCours);
                if(StoryboardExport._printImgPromises.length === enCours.length) break;
            }
        } catch(e) { console.warn('[Storyboard PDF] attente des images :', e); }
        StoryboardExport._printCapturing = false;
        // ON LE DIT. Une planche vide passait inapercue jusqu'a l'ouverture du
        // PDF ; mieux vaut l'annoncer au moment ou on peut encore recommencer.
        if(StoryboardExport._imagesRatees > 0) {
            Utils.toast(StoryboardExport._imagesRatees + ' image(s) du storyboard n\'ont pas pu être chargées — voir la console (F12).', 'warning', 9000);
        }
        // Laisser le temps aux objets vectoriels (setTimeout) de finir leur composition
        await new Promise(r => setTimeout(r, 500));
        
        // ===== 3. Récupérer toutes les pages générées =====
        const pages = offscreen.querySelectorAll('.sb-print-page');
        if(pages.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucune page à exporter', 'warning');
            try { document.body.removeChild(offscreen); } catch(_) {}
            return;
        }
        
        const A4 = { w: 210, h: 297 };
        let doc = null;
        
        // ===== 4. Rasteriser chaque page et l'ajouter au PDF =====
        try {
            for(let i = 0; i < pages.length; i++) {
                const pageEl = pages[i];
                const isLarge = pageEl.classList.contains('sb-print-page--large');
                const orientation = isLarge ? 'landscape' : 'portrait';
                const pageW = orientation === 'landscape' ? A4.h : A4.w;
                const pageH = orientation === 'landscape' ? A4.w : A4.h;
                
                // Rasteriser
                let dataUrl = null;
                try {
                    const rendered = await html2canvas(pageEl, {
                        scale: 1.5,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    dataUrl = rendered.toDataURL('image/jpeg', 0.85);
                } catch(err) {
                    console.warn('[Storyboard PDF] html2canvas fail page', i, err);
                    continue;
                }
                if(!dataUrl) continue;
                
                // Créer la page PDF
                if(!doc) {
                    doc = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
                    if(opts.includeCover !== false && typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
                        PdfTheme.coverPage(doc, { sectionName: 'Storyboard' });
                        doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                    }
                } else {
                    doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                }
                
                // Insérer l'image plein page (avec petite marge)
                // Zone réservée au footer unifié en bas = PdfTheme.FOOTER_ZONE_MM (14mm)
                const footerZone = (typeof PdfTheme !== 'undefined' && PdfTheme.FOOTER_ZONE_MM) ? PdfTheme.FOOTER_ZONE_MM : 14;
                const m = 5;
                const availW = pageW - m * 2;
                const availH = pageH - m - footerZone; // marge haute + zone footer
                const rect = pageEl.getBoundingClientRect();
                const ratio = rect.width / rect.height;
                let imgW = availW;
                let imgH = imgW / ratio;
                if(imgH > availH) {
                    imgH = availH;
                    imgW = imgH * ratio;
                }
                const imgX = (pageW - imgW) / 2;
                const imgY = m;
                
                try {
                    doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                } catch(err) {
                    console.warn('[Storyboard PDF] addImage fail:', err);
                }
                
                // Footer ad-hoc supprimé : géré uniformément par PdfTheme.applyFooters en fin d'export
            }
        } finally {
            // ===== 5. Cleanup =====
            try { document.body.removeChild(offscreen); } catch(_) {}
        }
        
        if(!doc) {
            if(!opts.returnBlob) Utils.toast('Échec génération Storyboard PDF', 'error');
            return;
        }
        
        // ===== Footer unifié sur toutes les pages =====
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { 
                skipFirstPage: opts.includeCover !== false,
                forDossier: !!opts.returnBlob
            });
        }
        
        // ===== 6. Téléchargement / blob =====
        // Pour returnBlob (mode Dossier de Production), la rotation paysage est
        // déjà gérée par buildDossierProd phase 7quater. On renvoie sans rotation.
        if(opts.returnBlob) return doc.output('blob');
        
        // En export solo : tourner les pages paysage 270° pour cohérence avec le Dossier
        let outBlob = doc.output('blob');
        if(typeof PdfTheme !== 'undefined' && PdfTheme.rotateLandscapePages) {
            outBlob = await PdfTheme.rotateLandscapePages(outBlob);
        }
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Storyboard')
            : `${cleanT(projectTitle) || 'Projet'} - Storyboard - moteur.studio.pdf`;
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        Utils.toast(`Storyboard exporté ! (${pages.length} page(s))`, 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `Storyboard PDF généré (${pages.length} pages)`);
    }
};

const DrawingEditor = {
    // ===================== ÉTAT =====================
    currentShotId: null,
    currentKind: 'original',  // Phase 1 Storyboard : zone éditée ('original'|'lighting'|'camera'|'actors')
    moodboardCallback: null,
    canvas: null,
    ctx: null,
    layers: [],
    currentLayerIndex: 0,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    currentTool: 'pencil',
    currentColor: '#000000',
    brushSize: 10,
    opacity: 100,
    history: [],
    historyStep: -1,
    transparentBg: false,
    
    colors: ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080'],
    
    // Phase 4A : couleurs récemment utilisées (max 10, persistées dans localStorage)
    recentColors: [],
    eyedropperActive: false,
    
    // ===================== OUVERTURE, CANVAS & COULEURS =====================
    toggleTransparent: (checked) => {
        DrawingEditor.transparentBg = checked;
        DrawingEditor.redraw();
    },
    
    open: (shotId, moodboardCallback = null, kind = 'original') => {
        // 31 aout — MEME ANGLE MORT QUE LE MOOD BOARD : on dessine a la SOURIS,
        // rien ici ne se declare cliquable, le verrou visuel ne voit donc rien.
        // La garde est posee a la porte, et elle depend de l'appelant : un plan
        // du storyboard (shotId renseigne) releve de la section Storyboard, une
        // planche du mood board (shotId nul) de la section Mood Board.
        const peutDessiner = shotId
            ? (typeof Permissions === 'undefined' || !Permissions.canEditFiche || Permissions.canEditFiche('shot'))
            : (typeof MoodBoard === 'undefined' || !MoodBoard.canWrite || MoodBoard.canWrite());
        if(!peutDessiner) {
            Utils.toast("Vous n'avez pas les droits de modification sur " + (shotId ? 'le storyboard' : 'le mood board') + '.', 'error');
            return;
        }
        DrawingEditor.currentShotId = shotId;
        DrawingEditor.currentKind = kind;
        // v601 — ON PREND LE VERROU A LA PORTE, PAS AU CURSEUR. Ici on dessine
        // a la SOURIS sur une toile : le curseur de texte ne se pose nulle
        // part, donc le declencheur habituel ne verrait jamais rien. Ouvrir
        // l'editeur sur un plan EST l'intention de le modifier — c'est donc
        // l'ouverture qui prend le verrou, et la fermeture qui le rend.
        // Meme raisonnement a tenir le jour ou l'on fera le mood board.
        if(shotId) { try { FicheLock.prendre('shot:' + shotId); } catch(e) {} }
        DrawingEditor.moodboardCallback = moodboardCallback;
        const modal = document.getElementById('drawing-modal');
        modal.style.display = 'flex';
        
        DrawingEditor.canvas = document.getElementById('drawingCanvas');
        DrawingEditor.ctx = DrawingEditor.canvas.getContext('2d');
        
        // Phase 1 Storyboard : récupère le drawingData de la zone demandée
        // Compat backwards : si kind='original' et `drawings.original` absent, on retombe sur shot.drawingData
        const _getZoneDrawingData = (shot) => {
            if(!shot) return null;
            if(shot.drawings && shot.drawings[kind]) {
                return shot.drawings[kind].drawingData || null;
            }
            // Fallback compat : shot ancien sans `drawings`, on lit shot.drawingData uniquement pour 'original'
            if(kind === 'original') return shot.drawingData || null;
            return null;
        };
        
        // Load existing drawing or create new
        if(shotId) {
            const shot = state.data.shots.find(s => s.id === shotId);
            const zoneDrawingData = _getZoneDrawingData(shot);
            if(zoneDrawingData) {
                DrawingEditor.layers = JSON.parse(JSON.stringify(zoneDrawingData.layers));
                DrawingEditor.currentLayerIndex = zoneDrawingData.currentLayer || 0;
                // Restaurer les calques depuis les données sauvegardées
                DrawingEditor.layers.forEach(layer => {
                    if(layer.imageData) {
                        const canvas = document.createElement('canvas');
                        canvas.width = 800;
                        canvas.height = 600;
                        const ctx = canvas.getContext('2d');
                        const img = new Image();
                        // Si l'imageData est une URL HTTP (Storage), activer CORS pour éviter le canvas tainted
                        if(typeof layer.imageData === 'string' && layer.imageData.startsWith('http')) {
                            img.crossOrigin = 'anonymous';
                        }
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0);
                            DrawingEditor.redraw();
                        };
                        img.onerror = () => {
                            console.warn('[DrawingEditor] Erreur chargement calque depuis Storage:', layer.imageData?.substring(0, 80));
                        };
                        img.src = Utils.signedUrlFor(layer.imageData);
                        layer.canvas = canvas;
                    } else {
                        layer.canvas = document.createElement('canvas');
                        layer.canvas.width = 800;
                        layer.canvas.height = 600;
                    }
                });
            } else {
                DrawingEditor.layers = [DrawingEditor.createNewLayer()];
                DrawingEditor.currentLayerIndex = 0;
            }
        } else {
            // Mode MoodBoard : nouveau dessin vierge
            DrawingEditor.layers = [DrawingEditor.createNewLayer()];
            DrawingEditor.currentLayerIndex = 0;
        }
        
        // Phase 1 Storyboard : préparer l'arrière-plan "original" pour les zones sémantiques
        DrawingEditor.originalBgImage = null;
        if(shotId && kind !== 'original') {
            const shot = state.data.shots.find(s => s.id === shotId);
            if(shot) {
                // 1) Image importée dans la zone original ?
                let originalUrl = null;
                if(shot.drawings && shot.drawings.original && shot.drawings.original.imageType === 'upload' && shot.drawings.original.imageUrl) {
                    originalUrl = shot.drawings.original.imageUrl;
                }
                // 2) Compat backwards : image importée à la racine du shot
                else if((!shot.drawings || !shot.drawings.original) && shot.imageType === 'upload' && shot.imageUrl) {
                    originalUrl = shot.imageUrl;
                }
                
                // 3) Sinon, dessin à composer depuis les calques + objets de l'original
                if(!originalUrl) {
                    let originalDrawingData = null;
                    if(shot.drawings && shot.drawings.original && shot.drawings.original.drawingData) {
                        originalDrawingData = shot.drawings.original.drawingData;
                    } else if(shot.drawingData) {
                        originalDrawingData = shot.drawingData;
                    }
                    // v595 : les images insérées en objet dans le dessin original doivent
                    // aussi apparaître en arrière-plan des zones lumière/caméra/acteurs —
                    // avant, seuls les calques pixel étaient composés, les objets
                    // restaient invisibles derrière.
                    const originalObjects = (shot.drawings && shot.drawings.original && Array.isArray(shot.drawings.original.objects))
                        ? shot.drawings.original.objects : [];
                    const originalLayers = (originalDrawingData && Array.isArray(originalDrawingData.layers)) ? originalDrawingData.layers : [];
                    
                    if(originalLayers.length > 0 || originalObjects.length > 0) {
                        // Composer les calques visibles + leurs objets, dans l'ordre, dans un canvas temporaire
                        const tmpCanvas = document.createElement('canvas');
                        tmpCanvas.width = DrawingEditor.canvas.width;
                        tmpCanvas.height = DrawingEditor.canvas.height;
                        const tmpCtx = tmpCanvas.getContext('2d');
                        const layersToCompose = originalLayers.filter(l => l.visible !== false);
                        const layerIds = new Set(originalLayers.map(l => l.id));
                        const orphanObjects = originalObjects.filter(o => !o.layerId || !layerIds.has(o.layerId));
                        
                        const loadImg = (src, cors) => new Promise(resolve => {
                            if(!src) { resolve(null); return; }
                            const im = new Image();
                            // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                            if(cors) im.crossOrigin = 'anonymous';
                            im.onload = () => resolve(im);
                            im.onerror = () => resolve(null);
                            im.src = Utils.signedUrlFor(src);
                        });
                        
                        Promise.all(layersToCompose.map(l => loadImg(l.imageData, typeof l.imageData === 'string' && l.imageData.startsWith('http')))).then(loadedImgs => {
                            // Calque par calque, dans l'ordre : les pixels du calque, puis
                            // ses objets — même logique que le rendu live (DrawingEditor.redraw)
                            layersToCompose.forEach((layer, i) => {
                                if(loadedImgs[i]) tmpCtx.drawImage(loadedImgs[i], 0, 0);
                                const layerObjects = originalObjects.filter(o => o.layerId === layer.id);
                                if(layerObjects.length > 0) Storyboard.renderObjectsOnCanvas(tmpCtx, layerObjects);
                            });
                            if(orphanObjects.length > 0) Storyboard.renderObjectsOnCanvas(tmpCtx, orphanObjects);
                            
                            const dataUrl = tmpCanvas.toDataURL();
                            const img = new Image();
                            img.onload = () => { DrawingEditor.redraw(); };
                            img.src = dataUrl;
                            DrawingEditor.originalBgImage = img;
                        });
                    }
                }
                
                // Si on a une URL directe (image importée), la charger
                if(originalUrl) {
                    const img = new Image();
                    // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                    if(typeof originalUrl === 'string' && originalUrl.startsWith('http')) img.crossOrigin = 'anonymous';
                    img.onload = () => { DrawingEditor.redraw(); };
                    img.src = Utils.signedUrlFor(originalUrl);
                    DrawingEditor.originalBgImage = img;
                }
            }
        }
        
        DrawingEditor.setupCanvas();
        DrawingEditor.renderColorPalette();
        DrawingEditor.renderLayers();
        
        // Phase 4A : charger les couleurs récentes depuis localStorage
        try {
            const stored = localStorage.getItem('moteur_drawing_recent_colors');
            if(stored) {
                const parsed = JSON.parse(stored);
                if(Array.isArray(parsed)) {
                    DrawingEditor.recentColors = parsed.filter(c => typeof c === 'string').slice(0, 10);
                }
            }
        } catch(_) { /* localStorage indisponible ou JSON invalide, silent */ }
        
        // Phase 4A : reset du mode pipette à chaque ouverture
        DrawingEditor.eyedropperActive = false;
        
        // Phase 4A : charger les couleurs récentes depuis localStorage
        try {
            const stored = localStorage.getItem('moteur_drawing_recent_colors');
            if(stored) {
                const parsed = JSON.parse(stored);
                if(Array.isArray(parsed)) {
                    DrawingEditor.recentColors = parsed.filter(c => typeof c === 'string').slice(0, 10);
                }
            }
        } catch(_) { /* localStorage indisponible ou JSON invalide, silent */ }
        
        // Phase 4A : reset du mode pipette à chaque ouverture
        DrawingEditor.eyedropperActive = false;
        
        // Phase 4A : re-render de la palette pour afficher les récentes chargées
        DrawingEditor.renderColorPalette();
        
        // Phase 3B Storyboard : afficher la palette d'objets pour les zones sémantiques
        const paletteGroup = document.getElementById('objectsPaletteGroup');
        const showPalette = ['lighting', 'camera', 'actors'].includes(kind);
        if(paletteGroup) {
            paletteGroup.style.display = showPalette ? 'block' : 'none';
            if(showPalette) {
                DrawingEditor.renderObjectsPalette();
            }
        }
        // Phase 4B v2 : bouton "Insérer image" dans sidebar gauche, visible UNIQUEMENT pour Original
        // (pour les zones sémantiques, le bouton est déjà dans la colonne droite)
        const leftInsertGroup = document.getElementById('leftSidebarInsertImage');
        if(leftInsertGroup) {
            leftInsertGroup.style.display = showPalette ? 'none' : 'block';
        }
        // Phase 3C v3 : reset de l'état "objet sélectionné" (mode transform)
        DrawingEditor.selectedObjectIdx = -1;
        DrawingEditor.transformingHandle = null;
        if(DrawingEditor.canvas) DrawingEditor.canvas.style.cursor = '';
        
        DrawingEditor.redraw();
        DrawingEditor.saveState();
    },
    
    close: async () => {
        // v601 : on rend le verrou du plan en quittant l'editeur (voir open).
        try { if(DrawingEditor.currentShotId) FicheLock.liberer('shot:' + DrawingEditor.currentShotId); } catch(e) {}

        const shotId = DrawingEditor.currentShotId;
        const callback = DrawingEditor.moodboardCallback;
        
        // Dessiner DEPUIS la fenêtre "Édition Plan" (elle a déjà son propre
        // Fermer/Sauvegarder) ne doit pas redemander une deuxième fois : le
        // dessin s'enregistre tout seul, silencieusement, en refermant son
        // éditeur — la seule vraie question "sauvegarder ?" reste celle de
        // la fenêtre du plan. Dessiner depuis la grille du Storyboard (sans
        // passer par cette fenêtre) garde la confirmation : c'est alors le
        // seul moment où l'on peut demander.
        const insideEditModal = !callback && shotId && Storyboard.currentEditingShotId === shotId;
        const shouldSave = insideEditModal || await ConfirmModal.show({ title: 'Sauvegarder ?', message: 'Voulez-vous sauvegarder les modifications apportées à ce dessin ?', icon: '💾', confirmText: 'Sauvegarder' });
        
        if(shouldSave) {
            if(callback) {
                // Mode MoodBoard : retourner l'image via callback
                const dataUrl = DrawingEditor.getCompositeImage();
                callback(dataUrl);
            } else if(insideEditModal) {
                // v616 : depuis "Édition Plan", on n'appelle plus Store.save() ici.
                // On committe le dessin (calques uploadés, shot.drawings à jour)
                // et on laisse la fenêtre du plan faire l'UNIQUE sauvegarde réseau,
                // comme pour ses autres champs. Deux sauvegardes indépendantes coup
                // sur coup (celle du dessin, puis celle du plan) créaient une
                // fenêtre de course avec le rechargement temps réel — cause
                // probable du calque qui reparaissait tout seul (v615).
                await DrawingEditor._commitDrawingData();
                Storyboard.markAsDirty();
                if(Storyboard.currentEditingShotId === shotId) {
                    setTimeout(() => Storyboard.refreshEditModal(shotId), 100);
                }
            } else {
                // Mode Storyboard classique (dessin ouvert seul, hors fenêtre
                // Édition Plan) : personne d'autre ne sauvegardera à notre place.
                // IMPORTANT : on attend la fin réelle de save() (un upload réseau
                // par calque) avant d'effacer l'état de l'éditeur ci-dessous —
                // sinon une fermeture rapide, ou une connexion un peu lente,
                // pouvait couper la sauvegarde en plein vol et faire perdre les
                // calques qu'on venait d'éditer.
                await DrawingEditor.save();
            }
        }
        document.getElementById('drawing-modal').style.display = 'none';
        DrawingEditor.currentShotId = null;
        DrawingEditor.moodboardCallback = null;
        DrawingEditor.layers = [];
        DrawingEditor.history = [];
        DrawingEditor.historyStep = -1;
    },
    
    getCompositeImage: () => {
        // Créer un canvas composite avec tous les calques visibles
        const composite = document.createElement('canvas');
        composite.width = 800;
        composite.height = 600;
        const ctx = composite.getContext('2d');
        
        // Fond blanc seulement si pas transparent
        if(!DrawingEditor.transparentBg) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, composite.width, composite.height);
        }
        
        // Superposer les calques visibles
        DrawingEditor.layers.forEach(layer => {
            if(layer.visible) {
                ctx.drawImage(layer.canvas, 0, 0);
            }
        });
        
        return composite.toDataURL('image/png');
    },
    
    setupCanvas: () => {
        DrawingEditor.canvas.addEventListener('mousedown', DrawingEditor.startDrawing);
        DrawingEditor.canvas.addEventListener('mousemove', DrawingEditor.draw);
        DrawingEditor.canvas.addEventListener('mouseup', DrawingEditor.stopDrawing);
        DrawingEditor.canvas.addEventListener('mouseout', DrawingEditor.stopDrawing);
        // Phase 3C Storyboard : clic droit sur un objet = menu contextuel custom
        DrawingEditor.canvas.addEventListener('contextmenu', DrawingEditor.handleContextMenu);
        // Phase 3C v2 Storyboard : drag-and-drop depuis la palette vers le canvas
        DrawingEditor.canvas.addEventListener('dragover', DrawingEditor.handleCanvasDragOver);
        DrawingEditor.canvas.addEventListener('drop', DrawingEditor.handleCanvasDrop);
        
        // Touch support
        DrawingEditor.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            DrawingEditor.canvas.dispatchEvent(mouseEvent);
        });
        
        DrawingEditor.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            DrawingEditor.canvas.dispatchEvent(mouseEvent);
        });
        
        DrawingEditor.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            DrawingEditor.canvas.dispatchEvent(mouseEvent);
        });
    },
    
    createNewLayer: () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        return {
            id: Utils.generateUniqueId(),
            canvas: canvas,
            visible: true,
            name: 'Calque ' + (DrawingEditor.layers.length + 1)
        };
    },
    
    renderColorPalette: () => {
        const container = document.getElementById('colorPalette');
        if(!container) return;
        container.innerHTML = '';
        
        // Couleurs prédéfinies (toujours présentes)
        DrawingEditor.colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch' + (DrawingEditor.currentColor.toLowerCase() === color.toLowerCase() ? ' active' : '');
            swatch.style.background = color;
            swatch.title = color;
            swatch.onclick = () => DrawingEditor.selectColor(color);
            container.appendChild(swatch);
        });
        
        // Phase 4A : couleurs récemment utilisées
        const recentContainer = document.getElementById('recentColorsPalette');
        const recentLabel = document.getElementById('recentColorsLabel');
        if(recentContainer && recentLabel) {
            const recents = DrawingEditor.recentColors || [];
            if(recents.length > 0) {
                recentLabel.style.display = 'block';
                recentContainer.innerHTML = '';
                recents.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch' + (DrawingEditor.currentColor.toLowerCase() === color.toLowerCase() ? ' active' : '');
                    swatch.style.background = color;
                    swatch.title = color;
                    swatch.onclick = () => DrawingEditor.selectColor(color);
                    recentContainer.appendChild(swatch);
                });
            } else {
                recentLabel.style.display = 'none';
                recentContainer.innerHTML = '';
            }
        }
        
        // Synchroniser le picker natif sur la couleur actuelle
        const picker = document.getElementById('customColorPicker');
        if(picker && /^#[0-9a-f]{6}$/i.test(DrawingEditor.currentColor)) {
            picker.value = DrawingEditor.currentColor;
        }
    },
    
    // Phase 4A : sélectionne une couleur et l'ajoute aux récentes (sauf si elle est dans les prédéfinies)
    selectColor: (color) => {
        if(!color) return;
        DrawingEditor.currentColor = color;
        
        // Ne pas mémoriser dans "récentes" si la couleur est déjà dans les prédéfinies
        const isPredefined = DrawingEditor.colors.some(c => c.toLowerCase() === color.toLowerCase());
        if(!isPredefined) {
            DrawingEditor.recentColors = DrawingEditor.recentColors || [];
            // Retirer si elle existe déjà (pour la remonter en tête)
            DrawingEditor.recentColors = DrawingEditor.recentColors.filter(c => c.toLowerCase() !== color.toLowerCase());
            // Ajouter en tête
            DrawingEditor.recentColors.unshift(color);
            // Limiter à 10
            if(DrawingEditor.recentColors.length > 10) {
                DrawingEditor.recentColors = DrawingEditor.recentColors.slice(0, 10);
            }
            // Persister
            try {
                localStorage.setItem('moteur_drawing_recent_colors', JSON.stringify(DrawingEditor.recentColors));
            } catch(_) { /* localStorage indisponible (mode privé), silent */ }
        }
        
        DrawingEditor.renderColorPalette();
    },
    
    // Phase 4A : appelée par l'input color natif
    pickCustomColor: (color) => {
        DrawingEditor.selectColor(color);
    },
    
    // Phase 4A : active/désactive le mode pipette
    toggleEyedropper: () => {
        DrawingEditor.eyedropperActive = !DrawingEditor.eyedropperActive;
        const btn = document.getElementById('eyedropperBtn');
        if(btn) {
            if(DrawingEditor.eyedropperActive) {
                btn.style.background = 'var(--primary)';
                btn.style.color = 'white';
            } else {
                btn.style.background = 'var(--panel-bg)';
                btn.style.color = '';
            }
        }
        if(DrawingEditor.canvas) {
            DrawingEditor.canvas.style.cursor = DrawingEditor.eyedropperActive ? 'crosshair' : '';
        }
        if(DrawingEditor.eyedropperActive) {
            Utils.toast('💧 Pipette active : cliquez sur le canvas pour récupérer une couleur', 'info', 2500);
        }
    },
    
    // Phase 4A : récupère la couleur du pixel cliqué et sort du mode pipette
    pickColorFromCanvas: (canvasX, canvasY) => {
        try {
            const x = Math.max(0, Math.min(DrawingEditor.canvas.width - 1, Math.round(canvasX)));
            const y = Math.max(0, Math.min(DrawingEditor.canvas.height - 1, Math.round(canvasY)));
            const pixel = DrawingEditor.ctx.getImageData(x, y, 1, 1).data;
            const r = pixel[0], g = pixel[1], b = pixel[2], a = pixel[3];
            // Si pixel transparent (canvas vide à cet endroit), prendre la couleur de fond perçue (blanc)
            if(a === 0) {
                Utils.toast('Pixel transparent — couleur blanche prise par défaut', 'info', 2000);
                DrawingEditor.selectColor('#FFFFFF');
            } else {
                // Convertir en hex
                const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
                const hex = '#' + toHex(r) + toHex(g) + toHex(b);
                DrawingEditor.selectColor(hex);
            }
        } catch(err) {
            console.error('Pipette : impossible de lire le pixel', err);
            Utils.toast('Pipette : erreur de lecture', 'error');
        }
        // Sortir du mode pipette
        DrawingEditor.eyedropperActive = false;
        const btn = document.getElementById('eyedropperBtn');
        if(btn) {
            btn.style.background = 'var(--panel-bg)';
            btn.style.color = '';
        }
        DrawingEditor.canvas.style.cursor = '';
    },
    
    // Phase 4B v2 : insérer une image comme nouveau calque pixel de fond
    // (uniquement appelé depuis la zone Original ; idéal comme base de planche pour dessiner par-dessus)
    // - Crée un nouveau calque (taille canvas) en bas de la pile (unshift)
    // - Y dessine l'image compressée centrée + ratio préservé (letterbox transparent autour)
    // - Le calque actif courant n'est PAS changé (on continue à dessiner dans son calque)
    // ===================== IMAGES & CALQUES =====================
    // Phase 4B v2 : ouvrir un sélecteur de fichier et insérer l'image comme objet déplaçable
    insertImageFromFile: () => {
        if(!DrawingEditor.currentShotId || !DrawingEditor.currentKind) {
            Utils.toast('Aucune zone active', 'error');
            return;
        }
        
        // Créer un input file invisible
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if(!file) return;
            
            // Limite de taille (5 Mo) pour éviter de surcharger Supabase
            if(file.size > 5 * 1024 * 1024) {
                Utils.toast('Image trop volumineuse (max 5 Mo)', 'error');
                return;
            }
            
            // Charger l'image pour récupérer ses dimensions natives
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const dataUrl = ev.target.result;
                const img = new Image();
                img.onload = async () => {
                    // Compression locale pour avoir les bonnes dimensions canvas
                    const compressed = DrawingEditor._compressImage(img, 1280, 720, 0.8);
                    const before = Math.round(dataUrl.length / 1024);
                    const after = Math.round(compressed.dataUrl.length / 1024);
                    
                    // === Upload vers Storage (au lieu de garder le base64 en state.data) ===
                    Utils.toast('Envoi de l\'image...', 'info', 2000);
                    const blob = await (await fetch(compressed.dataUrl)).blob();
                    const blobAsFile = new File([blob], 'storyboard_obj.jpg', { type: blob.type || 'image/jpeg' });
                    const url = await Utils.uploadProjectFile(blobAsFile, {
                        category: 'storyboard',
                        entityId: DrawingEditor.currentShotId || 'shot',
                        kind: 'gallery',  // multiple par shot
                        maxDimension: 1280, quality: 0.8, maxKb: 500
                    });
                    if(!url) return; // erreur déjà signalée
                    
                    // _addImageObject va recevoir l'URL Storage à la place du base64
                    DrawingEditor._addImageObject(url, compressed.width, compressed.height);
                };
                img.onerror = () => {
                    Utils.toast('Erreur de chargement de l\'image', 'error');
                };
                img.src = dataUrl;
            };
            reader.onerror = () => {
                Utils.toast('Erreur de lecture du fichier', 'error');
            };
            reader.readAsDataURL(file);
        };
        
        document.body.appendChild(input);
        input.click();
        // Nettoyer l'input après usage
        setTimeout(() => { input.remove(); }, 1000);
    },
    
    // Phase 4B v2 : ajouter un objet image à la zone courante (helper privé)
    _addImageObject: (dataUrl, naturalWidth, naturalHeight) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        
        // S'assurer que la zone existe avec sa structure complète
        if(!shot.drawings) {
            shot.drawings = { original: null, lighting: null, camera: null, actors: null };
        }
        if(!shot.drawings[DrawingEditor.currentKind]) {
            shot.drawings[DrawingEditor.currentKind] = {
                imageType: 'drawing',
                imageUrl: null,
                drawingData: null,
                objects: []
            };
        }
        if(!Array.isArray(shot.drawings[DrawingEditor.currentKind].objects)) {
            shot.drawings[DrawingEditor.currentKind].objects = [];
        }
        
        // Calculer un scale par défaut : l'image fait au max 50% de la largeur/hauteur du canvas
        const canvas = DrawingEditor.canvas;
        const maxWidth = canvas.width * 0.5;
        const maxHeight = canvas.height * 0.5;
        let scale = 1;
        if(naturalWidth > maxWidth) scale = Math.min(scale, maxWidth / naturalWidth);
        if(naturalHeight > maxHeight) scale = Math.min(scale, maxHeight / naturalHeight);
        
        // Position : centre du canvas
        const x = canvas.width / 2;
        const y = canvas.height / 2;
        
        shot.drawings[DrawingEditor.currentKind].objects.push({
            id: Utils.generateUniqueId(),
            type: 'image',
            imageData: dataUrl,
            x: Math.round(x),
            y: Math.round(y),
            scale: scale,
            rotation: 0,
            width: naturalWidth,
            height: naturalHeight,
            // v595 : l'objet appartient au calque actif, pour se dessiner à sa place
            // dans la pile (et non plus systématiquement par-dessus tous les calques)
            layerId: (DrawingEditor.layers[DrawingEditor.currentLayerIndex] || {}).id || null
        });
        
        if(Storyboard.markAsDirty) Storyboard.markAsDirty();
        if(DrawingEditor.currentKind !== 'original') {
            DrawingEditor.renderObjectsPalette();  // Met à jour la liste "Placés"
        }
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
        Utils.toast('Image insérée — clic droit pour la transformer', 'success', 2500);
    },
    
    // Phase 4B v2 : compresse une image via canvas pour limiter la taille en base64
    // - imgElement : HTMLImageElement déjà chargé (img.onload résolu)
    // - maxWidth/maxHeight : dimensions cibles maximales (le ratio est conservé)
    // - quality : qualité JPEG entre 0 et 1 (ex. 0.8)
    // Retourne { dataUrl, width, height }
    _compressImage: (imgElement, maxWidth, maxHeight, quality) => {
        const srcW = imgElement.naturalWidth || imgElement.width;
        const srcH = imgElement.naturalHeight || imgElement.height;
        
        // Calcul du ratio de redimensionnement (on ne fait que réduire, jamais agrandir)
        let ratio = 1;
        if(srcW > maxWidth) ratio = Math.min(ratio, maxWidth / srcW);
        if(srcH > maxHeight) ratio = Math.min(ratio, maxHeight / srcH);
        
        const targetW = Math.round(srcW * ratio);
        const targetH = Math.round(srcH * ratio);
        
        // Canvas hors-écran pour le redimensionnement
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        // Lissage de qualité pour le downscale
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(imgElement, 0, 0, targetW, targetH);
        
        // Export JPEG (pas de canal alpha, mais bien plus compact que PNG pour des photos)
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        return { dataUrl: dataUrl, width: targetW, height: targetH };
    },
    
    // Phase 4B v3 : déplacer un calque de fromIdx vers toIdx (réordonnancement par drag-and-drop)
    _reorderLayers: (fromIdx, toIdx) => {
        const layers = DrawingEditor.layers;
        if(fromIdx < 0 || fromIdx >= layers.length || toIdx < 0 || toIdx >= layers.length) return;
        if(fromIdx === toIdx) return;
        
        // Retirer l'élément déplacé et l'insérer à sa nouvelle position
        const moved = layers.splice(fromIdx, 1)[0];
        layers.splice(toIdx, 0, moved);
        
        // Si le calque déplacé était le calque actif, mettre à jour l'index actif
        if(DrawingEditor.currentLayerIndex === fromIdx) {
            DrawingEditor.currentLayerIndex = toIdx;
        } else if(fromIdx < DrawingEditor.currentLayerIndex && toIdx >= DrawingEditor.currentLayerIndex) {
            DrawingEditor.currentLayerIndex -= 1;
        } else if(fromIdx > DrawingEditor.currentLayerIndex && toIdx <= DrawingEditor.currentLayerIndex) {
            DrawingEditor.currentLayerIndex += 1;
        }
        
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
        DrawingEditor.saveState();
    },
    
    renderLayers: () => {
        const container = document.getElementById('layersList');
        container.innerHTML = '';
        
        // v595 : les objets vivent visuellement dans leur calque (voir redraw) —
        // la vignette doit donc les inclure, sinon une image insérée n'apparaît
        // jamais dans la miniature du calque où elle vit.
        const shotForThumbs = (DrawingEditor.currentShotId) ? state.data.shots.find(s => s.id === DrawingEditor.currentShotId) : null;
        const zoneForThumbs = (shotForThumbs && DrawingEditor.currentKind) ? (shotForThumbs.drawings && shotForThumbs.drawings[DrawingEditor.currentKind]) : null;
        const allObjectsForThumbs = (zoneForThumbs && Array.isArray(zoneForThumbs.objects)) ? zoneForThumbs.objects : [];
        
        DrawingEditor.layers.forEach((layer, idx) => {
            const item = document.createElement('div');
            item.className = 'layer-item' + (idx === DrawingEditor.currentLayerIndex ? ' active' : '');
            // Phase 4B v3 : drag-and-drop pour réordonner les calques
            item.draggable = true;
            item.dataset.layerIdx = idx;
            item.title = 'Glisser pour réordonner — haut de liste = arrière-plan, bas = premier plan';
            let thumbSrc = '';
            try {
                const tmp = document.createElement('canvas');
                tmp.width = layer.canvas.width;
                tmp.height = layer.canvas.height;
                const tctx = tmp.getContext('2d');
                tctx.drawImage(layer.canvas, 0, 0);
                const layerObjects = allObjectsForThumbs.filter(o => o.layerId === layer.id);
                if(layerObjects.length > 0) Storyboard.renderObjectsOnCanvas(tctx, layerObjects);
                thumbSrc = tmp.toDataURL();
            } catch(e) { thumbSrc = ''; }
            item.innerHTML = `
                <div class="layer-item-header">
                    <span style="cursor: grab; opacity: 0.5; padding: 0 4px;" title="Glisser">⋮⋮</span>
                    <span class="layer-visibility" onclick="app.DrawingEditor.toggleLayerVisibility(${idx})">${layer.visible ? '👁️' : '👁️‍🗨️'}</span>
                    <span class="flex-1">${Utils.escape(layer.name)}</span>
                    ${DrawingEditor.layers.length > 1 ? `<button onclick="app.DrawingEditor.deleteLayer(${idx})" style="background: none; border: none; color: var(--danger); cursor: pointer;">🗑️</button>` : ''}
                </div>
                ${thumbSrc ? `<img class="layer-thumb" src="${thumbSrc}" alt="">` : '<div class="layer-thumb"></div>'}
            `;
            item.onclick = (e) => {
                if(!e.target.closest('button') && !e.target.closest('.layer-visibility')) {
                    DrawingEditor.currentLayerIndex = idx;
                    // v595 : changer de calque désélectionne l'objet en cours
                    // (sinon on pouvait encore le déplacer/transformer depuis un autre calque)
                    DrawingEditor.selectedObjectIdx = -1;
                    DrawingEditor.renderLayers();
                    DrawingEditor.redraw();
                }
            };
            // Listeners drag-and-drop
            item.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', 'layer:' + idx);
                e.dataTransfer.effectAllowed = 'move';
                item.style.opacity = '0.5';
            };
            item.ondragend = () => { item.style.opacity = ''; };
            item.ondragover = (e) => {
                const data = e.dataTransfer.types.includes('text/plain');
                if(data) { e.preventDefault(); item.style.borderTop = '2px solid var(--primary)'; }
            };
            item.ondragleave = () => { item.style.borderTop = ''; };
            item.ondrop = (e) => {
                e.preventDefault();
                item.style.borderTop = '';
                const data = e.dataTransfer.getData('text/plain');
                if(!data || !data.startsWith('layer:')) return;
                const fromIdx = parseInt(data.substring(6));
                if(isNaN(fromIdx) || fromIdx === idx) return;
                DrawingEditor._reorderLayers(fromIdx, idx);
            };
            container.appendChild(item);
        });
    },
    
    // ===================== DESSIN =====================
    startDrawing: (e) => {
        // Phase 3C v3 Storyboard : ignorer le clic droit (géré par handleContextMenu pour les poignées)
        if(e.button && e.button !== 0) return;
        
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left);
        const y = Math.floor(e.clientY - rect.top);
        
        // Phase 4A : mode pipette actif → récupérer la couleur du pixel et sortir du mode
        if(DrawingEditor.eyedropperActive) {
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            DrawingEditor.pickColorFromCanvas(canvasX, canvasY);
            return;  // Bloquer tout le reste (dessin, drag, etc.)
        }
        
        // Phase 3C v2 Storyboard : si on clique gauche sur un objet existant (toutes zones, original inclus pour les images)
        if(DrawingEditor.currentKind) {
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            
            // Phase 3C v3 : si un objet est sélectionné, prioriser la détection des poignées
            if(typeof DrawingEditor.selectedObjectIdx === 'number' && DrawingEditor.selectedObjectIdx >= 0) {
                const handle = DrawingEditor.findHandleAt(canvasX, canvasY);
                if(handle === 'delete') {
                    DrawingEditor.removePlacedObject(DrawingEditor.selectedObjectIdx);
                    return;  // Bloquer le dessin et le drag
                }
                if(handle) {
                    const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
                    const obj = shot && shot.drawings[DrawingEditor.currentKind].objects[DrawingEditor.selectedObjectIdx];
                    if(obj) {
                        DrawingEditor.transformingHandle = handle;
                        DrawingEditor.transformStartX = canvasX;
                        DrawingEditor.transformStartY = canvasY;
                        DrawingEditor.transformInitialScale = obj.scale || 1;
                        DrawingEditor.transformInitialRotation = obj.rotation || 0;
                        DrawingEditor.transformObjectCx = obj.x;
                        DrawingEditor.transformObjectCy = obj.y;
                        DrawingEditor.canvas.style.cursor = (handle === 'rotate') ? 'grab' : 'nwse-resize';
                        return;  // Bloquer le dessin et le drag
                    }
                }
            }
            
            // Sinon, drag d'objet pour déplacer
            const objIdx = DrawingEditor.findObjectAt(canvasX, canvasY);
            if(objIdx >= 0) {
                DrawingEditor.draggingObjectIdx = objIdx;
                DrawingEditor.draggingStartX = canvasX;
                DrawingEditor.draggingStartY = canvasY;
                const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
                const obj = shot.drawings[DrawingEditor.currentKind].objects[objIdx];
                DrawingEditor.draggingObjectInitialX = obj.x;
                DrawingEditor.draggingObjectInitialY = obj.y;
                DrawingEditor.canvas.style.cursor = 'grabbing';
                return;  // Bloquer le dessin
            }
        }
        
        DrawingEditor.isDrawing = true;
        DrawingEditor.lastX = x;
        DrawingEditor.lastY = y;
    },
    
    draw: (e) => {
        // Phase 3C v3 Storyboard : drag d'une poignée (transform : resize ou rotate)
        if(DrawingEditor.transformingHandle) {
            const rect = DrawingEditor.canvas.getBoundingClientRect();
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot && shot.drawings && shot.drawings[DrawingEditor.currentKind];
            const obj = zone && zone.objects && zone.objects[DrawingEditor.selectedObjectIdx];
            if(obj) {
                const cx = DrawingEditor.transformObjectCx;
                const cy = DrawingEditor.transformObjectCy;
                
                if(DrawingEditor.transformingHandle === 'rotate') {
                    // Angle entre le centre et la souris (en degrés, 0° = haut)
                    const dx = canvasX - cx;
                    const dy = canvasY - cy;
                    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
                    obj.rotation = Math.round(angleDeg);
                } else {
                    // Resize : ratio de distance entre la souris et le centre vs. distance initiale
                    const initDx = DrawingEditor.transformStartX - cx;
                    const initDy = DrawingEditor.transformStartY - cy;
                    const initDist = Math.sqrt(initDx * initDx + initDy * initDy);
                    const curDx = canvasX - cx;
                    const curDy = canvasY - cy;
                    const curDist = Math.sqrt(curDx * curDx + curDy * curDy);
                    if(initDist > 1) {
                        const ratio = curDist / initDist;
                        const newScale = DrawingEditor.transformInitialScale * ratio;
                        obj.scale = Math.max(0.25, Math.min(5, newScale));
                    }
                }
                DrawingEditor.redraw();
            }
            return;  // Bloquer dessin et drag
        }
        
        // Phase 3C v2 Storyboard : drag d'un objet posé (déplacement)
        if(typeof DrawingEditor.draggingObjectIdx === 'number' && DrawingEditor.draggingObjectIdx >= 0) {
            const rect = DrawingEditor.canvas.getBoundingClientRect();
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            const dx = canvasX - DrawingEditor.draggingStartX;
            const dy = canvasY - DrawingEditor.draggingStartY;
            
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot && shot.drawings && shot.drawings[DrawingEditor.currentKind];
            if(zone && Array.isArray(zone.objects)) {
                const obj = zone.objects[DrawingEditor.draggingObjectIdx];
                if(obj) {
                    obj.x = Math.round(DrawingEditor.draggingObjectInitialX + dx);
                    obj.y = Math.round(DrawingEditor.draggingObjectInitialY + dy);
                    DrawingEditor.redraw();
                }
            }
            return;  // Bloquer le dessin pendant le drag
        }
        
        if(!DrawingEditor.isDrawing) return;
        
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const layer = DrawingEditor.layers[DrawingEditor.currentLayerIndex];
        const ctx = layer.canvas.getContext('2d');
        const tool = DrawingEditor.currentTool;
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Configuration selon l'outil
        if(tool === 'eraser') {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = DrawingEditor.brushSize;
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'destination-out';
        } else if(tool === 'pencil') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = Math.max(1, DrawingEditor.brushSize * 0.5);
            ctx.globalAlpha = (DrawingEditor.opacity / 100) * 0.8;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'pen') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = Math.max(1, DrawingEditor.brushSize * 0.7);
            ctx.globalAlpha = DrawingEditor.opacity / 100;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'marker') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = DrawingEditor.brushSize;
            ctx.globalAlpha = DrawingEditor.opacity / 100;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'highlighter') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = DrawingEditor.brushSize * 2;
            ctx.globalAlpha = 0.3;
            ctx.globalCompositeOperation = 'multiply';
            ctx.lineCap = 'square';
        } else if(tool === 'brush') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            const speed = Math.sqrt(Math.pow(x - DrawingEditor.lastX, 2) + Math.pow(y - DrawingEditor.lastY, 2));
            ctx.lineWidth = Math.max(1, DrawingEditor.brushSize * (1 + speed * 0.02));
            ctx.globalAlpha = DrawingEditor.opacity / 100;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'airbrush') {
            ctx.globalAlpha = 0.1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = DrawingEditor.currentColor;
            for(let i = 0; i < 20; i++) {
                const offsetX = (Math.random() - 0.5) * DrawingEditor.brushSize * 2;
                const offsetY = (Math.random() - 0.5) * DrawingEditor.brushSize * 2;
                ctx.beginPath();
                ctx.arc(x + offsetX, y + offsetY, Math.random() * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            DrawingEditor.lastX = x;
            DrawingEditor.lastY = y;
            DrawingEditor.redraw();
            return;
        }
        
        ctx.beginPath();
        ctx.moveTo(DrawingEditor.lastX, DrawingEditor.lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';
        
        DrawingEditor.lastX = x;
        DrawingEditor.lastY = y;
        
        DrawingEditor.redraw();
    },
    
    stopDrawing: () => {
        // Phase 3C v3 Storyboard : terminer une transformation (resize/rotate via poignée)
        if(DrawingEditor.transformingHandle) {
            DrawingEditor.transformingHandle = null;
            DrawingEditor.transformStartX = 0;
            DrawingEditor.transformStartY = 0;
            DrawingEditor.transformInitialScale = 1;
            DrawingEditor.transformInitialRotation = 0;
            DrawingEditor.transformObjectCx = 0;
            DrawingEditor.transformObjectCy = 0;
            DrawingEditor.canvas.style.cursor = '';
            if(Storyboard.markAsDirty) Storyboard.markAsDirty();
            DrawingEditor.renderLayers();
            DrawingEditor.redraw();
            return;
        }
        
        // Phase 3C v2 Storyboard : terminer un drag d'objet posé
        if(typeof DrawingEditor.draggingObjectIdx === 'number' && DrawingEditor.draggingObjectIdx >= 0) {
            DrawingEditor.draggingObjectIdx = -1;
            DrawingEditor.draggingStartX = 0;
            DrawingEditor.draggingStartY = 0;
            DrawingEditor.draggingObjectInitialX = 0;
            DrawingEditor.draggingObjectInitialY = 0;
            DrawingEditor.canvas.style.cursor = '';
            if(Storyboard.markAsDirty) Storyboard.markAsDirty();
            DrawingEditor.renderObjectsPalette();
            DrawingEditor.renderLayers();
            DrawingEditor.redraw();
            return;
        }
        
        if(DrawingEditor.isDrawing) {
            DrawingEditor.isDrawing = false;
            DrawingEditor.saveState();
        }
    },
	
	redraw: () => {
        // Clear main canvas
        DrawingEditor.ctx.clearRect(0, 0, DrawingEditor.canvas.width, DrawingEditor.canvas.height);
        
        // Phase 1 Storyboard : si on édite une zone sémantique, afficher l'original en arrière-plan (lecture seule)
        if(DrawingEditor.currentKind && DrawingEditor.currentKind !== 'original' 
           && DrawingEditor.originalBgImage && DrawingEditor.originalBgImage.complete && DrawingEditor.originalBgImage.naturalWidth > 0) {
            DrawingEditor.ctx.save();
            DrawingEditor.ctx.globalAlpha = 0.4; // arrière-plan estompé pour distinguer du calque actif
            DrawingEditor.ctx.drawImage(DrawingEditor.originalBgImage, 0, 0, DrawingEditor.canvas.width, DrawingEditor.canvas.height);
            DrawingEditor.ctx.restore();
        }
        
        // v595 : les objets (images insérées, annotations) appartiennent désormais
        // à un calque (layerId) et se dessinent intercalés avec les calques pixel,
        // dans leur ordre — plus systématiquement par-dessus tout. Un objet sans
        // calque correspondant (ancien projet, calque supprimé depuis) se dessine
        // en dernier, par-dessus, comme avant.
        const shotForObjects = (DrawingEditor.currentShotId) ? state.data.shots.find(s => s.id === DrawingEditor.currentShotId) : null;
        const zoneForObjects = (shotForObjects && DrawingEditor.currentKind) ? (shotForObjects.drawings && shotForObjects.drawings[DrawingEditor.currentKind]) : null;
        const allObjects = (zoneForObjects && Array.isArray(zoneForObjects.objects)) ? zoneForObjects.objects : [];
        const layerIds = new Set(DrawingEditor.layers.map(l => l.id));
        const orphanObjects = allObjects.filter(o => !o.layerId || !layerIds.has(o.layerId));
        
        DrawingEditor.layers.forEach(layer => {
            if(!layer.visible) return;
            DrawingEditor.ctx.drawImage(layer.canvas, 0, 0);
            const layerObjects = allObjects.filter(o => o.layerId === layer.id);
            if(layerObjects.length > 0) Storyboard.renderObjectsOnCanvas(DrawingEditor.ctx, layerObjects);
        });
        
        if(orphanObjects.length > 0) Storyboard.renderObjectsOnCanvas(DrawingEditor.ctx, orphanObjects);
        
        // Phase 3C v3 Storyboard : poignées de sélection (mode transform via clic droit)
        DrawingEditor.drawSelectionHandles();
    },
    
    // Phase 3B Storyboard : remplit la palette d'objets selon le kind courant
    // Affiche les objets de la catégorie correspondante + ceux de la catégorie 'machinery' (commune)
    // ===================== OBJETS PLACÉS & INTERACTIONS =====================
    renderObjectsPalette: () => {
        const palette = document.getElementById('objectsPalette');
        const placedList = document.getElementById('objectsPlacedList');
        if(!palette) return;
        
        const kind = DrawingEditor.currentKind;
        const catalog = (CONFIG.annotationObjects || []);
        // Phase 4B v2 : filtre par catégorie selon le kind
        // - tools : visible sur Lumière et Caméra (pas Acteurs : pied/sandbag/etc. concernent surtout l'équipe technique)
        // - machinery : visible uniquement avec la caméra (mouvements caméra)
        // - lighting/camera/actors : leur propre catégorie
        const items = catalog.filter(o => {
            if(o.category === kind) return true;
            if(o.category === 'tools' && kind !== 'actors') return true;  // Outils sur Lumière + Caméra uniquement
            if(o.category === 'machinery' && kind === 'camera') return true;  // Machinerie uniquement sur caméra
            return false;
        });
        
        // Phase 4B v2 : grouper les items par catégorie pour pouvoir insérer des séparateurs visuels
        const categoryLabels = {
            lighting: '💡 Lumière',
            camera: '🎥 Caméra',
            actors: '🎭 Acteurs',
            tools: '🔧 Outils',
            machinery: '🛞 Machinerie'
        };
        // Ordre d'affichage : catégorie principale d'abord (= kind), puis tools, puis machinery
        const categoryOrder = [kind, 'tools', 'machinery'];
        // Grouper les items par catégorie en respectant l'ordre
        const groups = {};
        items.forEach(o => {
            if(!groups[o.category]) groups[o.category] = [];
            groups[o.category].push(o);
        });
        
        // Helper pour rendre un bouton drag (SVG inline)
        const renderButton = (o) => {
            const isMachinery = o.category === 'machinery';
            const isTools = o.category === 'tools';
            const borderColor = isMachinery ? 'var(--text-sec)' : (isTools ? 'var(--text-sec)' : 'var(--primary)');
            const visual = o.svg
                ? `<div style="width: 28px; height: 28px; color: var(--text-main); pointer-events: none;">${o.svg}</div>`
                : `<span style="font-size: 1.3rem; pointer-events: none;">${o.emoji}</span>`;
            return `<div 
                draggable="true"
                ondragstart="app.DrawingEditor.handlePaletteDragStart(event, '${o.type}')"
                title="Glissez sur le canvas — ${Utils.escape(o.label)}"
                data-obj-type="${o.type}"
                style="width: 38px; height: 38px; padding: 4px; border: 1.5px solid ${borderColor}; background: var(--panel-bg); border-radius: 6px; cursor: grab; line-height: 1; display: flex; align-items: center; justify-content: center; user-select: none;">
                ${visual}
            </div>`;
        };
        
        // Phase 4B v2 : rendre chaque catégorie comme un sous-groupe avec son label + séparateur
        const groupsHtml = categoryOrder
            .filter(cat => groups[cat] && groups[cat].length > 0)
            .map((cat, idx) => {
                const buttons = groups[cat].map(renderButton).join('');
                const separator = idx > 0 
                    ? `<div style="height: 1px; background: var(--border); margin: 8px 0 6px; opacity: 0.6;"></div>` 
                    : '';
                const label = `<div style="font-size: 0.7rem; text-transform: uppercase; opacity: 0.6; margin-bottom: 5px; letter-spacing: 0.5px;">${categoryLabels[cat] || cat}</div>`;
                return `${separator}${label}<div style="display: flex; flex-wrap: wrap; gap: 4px;">${buttons}</div>`;
            })
            .join('');
        palette.innerHTML = groupsHtml;
        
        // Mettre à jour le hint affiché au-dessus de la palette
        const hint = document.getElementById('objectsPaletteHint');
        if(hint) hint.textContent = 'Glissez un objet sur le canvas pour le placer.';
        
        // Phase 4B : rendre la liste des objets déjà placés avec mini SVG
        if(placedList) {
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot && shot.drawings && shot.drawings[kind];
            const objects = (zone && Array.isArray(zone.objects)) ? zone.objects : [];
            
            if(objects.length === 0) {
                placedList.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-sec); font-style: italic;">Aucun objet placé</div>`;
            } else {
                // Phase 4B v3 : drag-and-drop pour réordonner les objets
                // (haut de liste = arrière-plan, bas de liste = premier plan, comme les calques)
                placedList.innerHTML = `
                    <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 6px;">Placés (${objects.length})</div>
                    <div style="font-size: 0.7rem; color: var(--text-sec); margin-bottom: 6px; font-style: italic;">Glisser pour réordonner</div>
                    ${objects.map((obj, idx) => {
                        // Phase 4B v2 : 3 cas pour la miniature et le label
                        let visual, label;
                        if(obj.type === 'image') {
                            visual = `<img src="${obj.imageData}" style="width: 16px; height: 16px; object-fit: cover; border-radius: 2px; flex-shrink: 0;" alt="">`;
                            label = 'Image';
                        } else {
                            const def = catalog.find(d => d.type === obj.type);
                            label = def ? def.label : obj.type;
                            visual = (def && def.svg)
                                ? `<div style="width: 16px; height: 16px; color: var(--text-main); flex-shrink: 0;">${def.svg}</div>`
                                : `<span style="font-size: 1rem; flex-shrink: 0;">${def ? def.emoji : '❓'}</span>`;
                        }
                        return `<div 
                            draggable="true"
                            data-placed-idx="${idx}"
                            ondragstart="app.DrawingEditor.onPlacedDragStart(event, ${idx})"
                            ondragend="app.DrawingEditor.onPlacedDragEnd(event)"
                            ondragover="app.DrawingEditor.onPlacedDragOver(event)"
                            ondragleave="app.DrawingEditor.onPlacedDragLeave(event)"
                            ondrop="app.DrawingEditor.onPlacedDrop(event, ${idx})"
                            style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: var(--bg); border-radius: 4px; margin-bottom: 3px; font-size: 0.78rem; cursor: grab;">
                            <span style="opacity: 0.4; font-size: 0.7rem;">⋮⋮</span>
                            ${visual}
                            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${Utils.escape(label)}">${Utils.escape(label)}</span>
                            <button onclick="event.stopPropagation(); app.DrawingEditor.removePlacedObject(${idx})" 
                                title="Supprimer cet objet" 
                                style="background: var(--danger); color: white; border: none; border-radius: 3px; padding: 2px 5px; cursor: pointer; font-size: 0.7rem;">🗑️</button>
                        </div>`;
                    }).join('')}
                `;
            }
        }
    },
    
    // Phase 3C Storyboard : dessine les poignées de sélection (8 carrés + flèche rotation) autour de l'objet sélectionné
    // Phase 3C Storyboard : retourne quelle poignée est sous le point (canvasX, canvasY) pour l'objet sélectionné
    // Renvoie : 'rotate' | 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | null
    findHandleAt: (canvasX, canvasY) => {
        const idx = DrawingEditor.selectedObjectIdx;
        if(typeof idx !== 'number' || idx < 0) return null;
        if(!DrawingEditor.currentKind) return null;
        
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return null;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return null;
        const obj = zone.objects[idx];
        if(!obj) return null;
        
        // Phase 4B v2 : dimensions variables selon le type d'objet
        const scale = obj.scale || 1;
        let halfW, halfH;
        if(obj.type === 'image') {
            halfW = ((obj.width || 100) * scale) / 2 + 6;
            halfH = ((obj.height || 100) * scale) / 2 + 6;
        } else {
            halfW = (48 * scale) / 2 + 6;
            halfH = halfW;
        }
        const cx = obj.x || 0;
        const cy = obj.y || 0;
        
        // Convertir le point cliqué en coordonnées locales (rotation inverse appliquée)
        const dx = canvasX - cx;
        const dy = canvasY - cy;
        const angle = -((obj.rotation || 0) * Math.PI / 180);
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
        
        // Hit-test poignée rotation (cercle au-dessus du cadre, basé sur la moitié supérieure)
        const rotHandleY = -halfH - 22;
        const rotDist = Math.sqrt(localX * localX + (localY - rotHandleY) * (localY - rotHandleY));
        if(rotDist <= 10) return 'rotate';
        
        // Poignée suppression : petite croix rouge, juste en dehors du coin haut-droit du cadre
        const delHandleX = halfW + 14;
        const delHandleY = -halfH - 14;
        const delDist = Math.sqrt((localX - delHandleX) * (localX - delHandleX) + (localY - delHandleY) * (localY - delHandleY));
        if(delDist <= 10) return 'delete';
        
        // Hit-test des 8 poignées de redimensionnement
        const tol = 8;
        const handles = [
            { name: 'nw', x: -halfW, y: -halfH },
            { name: 'n',  x: 0,      y: -halfH },
            { name: 'ne', x: halfW,  y: -halfH },
            { name: 'w',  x: -halfW, y: 0 },
            { name: 'e',  x: halfW,  y: 0 },
            { name: 'sw', x: -halfW, y: halfH },
            { name: 's',  x: 0,      y: halfH },
            { name: 'se', x: halfW,  y: halfH }
        ];
        for(const h of handles) {
            if(Math.abs(localX - h.x) <= tol && Math.abs(localY - h.y) <= tol) {
                return h.name;
            }
        }
        
        return null;
    },
    
    drawSelectionHandles: () => {
        const idx = DrawingEditor.selectedObjectIdx;
        if(typeof idx !== 'number' || idx < 0) return;
        if(!DrawingEditor.currentKind) return;
        
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return;
        const obj = zone.objects[idx];
        if(!obj) return;
        
        const ctx = DrawingEditor.ctx;
        // Phase 4B v2 : dimensions variables selon le type d'objet
        const scale = obj.scale || 1;
        let halfW, halfH;
        if(obj.type === 'image') {
            halfW = ((obj.width || 100) * scale) / 2 + 6;
            halfH = ((obj.height || 100) * scale) / 2 + 6;
        } else {
            halfW = (48 * scale) / 2 + 6;
            halfH = halfW;
        }
        const x = obj.x || 0;
        const y = obj.y || 0;
        
        ctx.save();
        ctx.translate(x, y);
        if(obj.rotation) ctx.rotate((obj.rotation || 0) * Math.PI / 180);
        
        // Cadre de sélection (rectangle pointillé bleu)
        ctx.strokeStyle = '#2b6ef6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
        ctx.setLineDash([]);
        
        // Les 8 poignées de redimensionnement (4 coins + 4 milieux)
        const handleSize = 8;
        const positions = [
            [-halfW, -halfH], [0, -halfH], [halfW, -halfH],
            [-halfW, 0],                    [halfW, 0],
            [-halfW, halfH],  [0, halfH],  [halfW, halfH]
        ];
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#2b6ef6';
        ctx.lineWidth = 1.5;
        positions.forEach(([px, py]) => {
            ctx.fillRect(px - handleSize/2, py - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(px - handleSize/2, py - handleSize/2, handleSize, handleSize);
        });
        
        // Flèche de rotation au-dessus du cadre
        const rotHandleY = -halfH - 22;
        // Ligne de connexion entre cadre et flèche rotation
        ctx.beginPath();
        ctx.moveTo(0, -halfH);
        ctx.lineTo(0, rotHandleY + 6);
        ctx.strokeStyle = '#2b6ef6';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Cercle de la poignée rotation
        ctx.beginPath();
        ctx.arc(0, rotHandleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        // Symbole rotation dans le cercle
        ctx.fillStyle = '#2b6ef6';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↻', 0, rotHandleY + 1);
        
        // Croix rouge de suppression, juste en dehors du coin haut-droit
        const delHandleX = halfW + 14;
        const delHandleY = -halfH - 14;
        ctx.beginPath();
        ctx.arc(delHandleX, delHandleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#e53935';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', delHandleX, delHandleY + 1);
        
        ctx.restore();
    },
    
    // Phase 3B Storyboard : supprime un objet placé (par son index dans le tableau)
    removePlacedObject: (idx) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return;
        if(idx < 0 || idx >= zone.objects.length) return;
        zone.objects.splice(idx, 1);
        // Si l'objet supprimé était sélectionné (mode transform), nettoyer la sélection
        if(DrawingEditor.selectedObjectIdx === idx) {
            DrawingEditor.selectedObjectIdx = -1;
        } else if(DrawingEditor.selectedObjectIdx > idx) {
            // Décaler l'index sélectionné si on a supprimé un élément avant lui
            DrawingEditor.selectedObjectIdx -= 1;
        }
        DrawingEditor.renderObjectsPalette();
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
    },
    
    // Phase 4B v2 : suppression d'un objet via la touche Suppr/Delete/Backspace
    handleKeyDown: (e) => {
        // Ignorer si la modale d'édition de dessin n'est pas visible (le DrawingEditor n'est pas actif)
        const modal = document.getElementById('drawing-modal');
        if(!modal || modal.style.display === 'none') return;
        
        // Ignorer si l'utilisateur tape dans un input/textarea/contenteditable
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if(tag === 'input' || tag === 'textarea' || tag === 'select' 
           || (e.target && e.target.isContentEditable)) return;
        
        // Touches gérées : Delete (Suppr) et Backspace
        if(e.key !== 'Delete' && e.key !== 'Backspace') return;
        
        // Ne supprimer que si un objet est sélectionné en mode transform
        const idx = DrawingEditor.selectedObjectIdx;
        if(typeof idx !== 'number' || idx < 0) return;
        
        // Vérifier qu'on a bien une zone et un shot actifs
        if(!DrawingEditor.currentKind || !DrawingEditor.currentShotId) return;
        
        e.preventDefault();
        DrawingEditor.removePlacedObject(idx);
    },
    
    // Phase 4B v3 : drag-and-drop pour réordonner les objets dans la liste "Placés"
    onPlacedDragStart: (e, idx) => {
        e.dataTransfer.setData('text/plain', 'placed:' + idx);
        e.dataTransfer.effectAllowed = 'move';
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.opacity = '0.5';
    },
    
    onPlacedDragEnd: (e) => {
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.opacity = '';
    },
    
    onPlacedDragOver: (e) => {
        const types = e.dataTransfer && e.dataTransfer.types;
        if(types && types.includes('text/plain')) {
            e.preventDefault();
            if(e.currentTarget && e.currentTarget.style) {
                e.currentTarget.style.borderTop = '2px solid var(--primary)';
            }
        }
    },
    
    onPlacedDragLeave: (e) => {
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.borderTop = '';
    },
    
    onPlacedDrop: (e, toIdx) => {
        e.preventDefault();
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.borderTop = '';
        const data = e.dataTransfer.getData('text/plain');
        if(!data || !data.startsWith('placed:')) return;
        const fromIdx = parseInt(data.substring(7));
        if(isNaN(fromIdx) || fromIdx === toIdx) return;
        DrawingEditor._reorderObjects(fromIdx, toIdx);
    },
    
    // Phase 4B v3 : déplacer un objet de fromIdx vers toIdx dans la liste objects[]
    _reorderObjects: (fromIdx, toIdx) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return;
        if(fromIdx < 0 || fromIdx >= zone.objects.length || toIdx < 0 || toIdx >= zone.objects.length) return;
        if(fromIdx === toIdx) return;
        
        // Retirer l'élément déplacé et l'insérer à sa nouvelle position
        const moved = zone.objects.splice(fromIdx, 1)[0];
        zone.objects.splice(toIdx, 0, moved);
        
        // Si l'objet déplacé était sélectionné en mode transform, mettre à jour son index
        if(DrawingEditor.selectedObjectIdx === fromIdx) {
            DrawingEditor.selectedObjectIdx = toIdx;
        } else if(fromIdx < DrawingEditor.selectedObjectIdx && toIdx >= DrawingEditor.selectedObjectIdx) {
            DrawingEditor.selectedObjectIdx -= 1;
        } else if(fromIdx > DrawingEditor.selectedObjectIdx && toIdx <= DrawingEditor.selectedObjectIdx) {
            DrawingEditor.selectedObjectIdx += 1;
        }
        
        if(Storyboard.markAsDirty) Storyboard.markAsDirty();
        DrawingEditor.renderObjectsPalette();
        DrawingEditor.redraw();
    },
    
    // Phase 3C v2 Storyboard : drag-and-drop natif depuis la palette vers le canvas
    handlePaletteDragStart: (e, type) => {
        e.dataTransfer.setData('text/plain', type);
        e.dataTransfer.effectAllowed = 'copy';
    },
    
    handleCanvasDragOver: (e) => {
        // Empêche le navigateur de bloquer le drop (comportement par défaut)
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    },
    
    handleCanvasDrop: (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        if(!type) return;
        // Vérifier qu'on est bien dans une zone sémantique
        if(!DrawingEditor.currentKind || DrawingEditor.currentKind === 'original') return;
        // Vérifier que le type existe dans le catalogue
        const def = (CONFIG.annotationObjects || []).find(o => o.type === type);
        if(!def) return;
        
        // Calculer les coordonnées canvas (avec scaling pour gérer un canvas affiché à taille différente)
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const scaleX = DrawingEditor.canvas.width / rect.width;
        const scaleY = DrawingEditor.canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        // Créer l'objet
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        if(!shot.drawings) shot.drawings = { original:null, lighting:null, camera:null, actors:null };
        if(!shot.drawings[DrawingEditor.currentKind]) {
            shot.drawings[DrawingEditor.currentKind] = {
                imageType: 'drawing',
                imageUrl: null,
                drawingData: null,
                objects: []
            };
        }
        if(!Array.isArray(shot.drawings[DrawingEditor.currentKind].objects)) {
            shot.drawings[DrawingEditor.currentKind].objects = [];
        }
        shot.drawings[DrawingEditor.currentKind].objects.push({
            id: Utils.generateUniqueId(),
            type: type,
            x: Math.round(canvasX),
            y: Math.round(canvasY),
            scale: 1,
            rotation: 0,
            layerId: (DrawingEditor.layers[DrawingEditor.currentLayerIndex] || {}).id || null
        });
        
        if(Storyboard.markAsDirty) Storyboard.markAsDirty();
        DrawingEditor.renderObjectsPalette();
        DrawingEditor.redraw();
    },
    
    // Phase 3C v3 Storyboard : clic droit sur un objet = activer le mode transform (poignées)
    // Clic droit dans le vide = désélectionner
    handleContextMenu: (e) => {
        e.preventDefault();  // Toujours bloquer le menu natif du navigateur sur le canvas
        if(!DrawingEditor.currentKind) return;
        
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const scaleX = DrawingEditor.canvas.width / rect.width;
        const scaleY = DrawingEditor.canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        const idx = DrawingEditor.findObjectAt(canvasX, canvasY);
        if(idx < 0) {
            // Clic droit dans le vide : désélectionner si une sélection existe
            if(typeof DrawingEditor.selectedObjectIdx === 'number' && DrawingEditor.selectedObjectIdx >= 0) {
                DrawingEditor.selectedObjectIdx = -1;
                DrawingEditor.redraw();
            }
            return;
        }
        
        // Activer le mode transform sur cet objet (les poignées apparaissent via drawSelectionHandles)
        DrawingEditor.selectedObjectIdx = idx;
        DrawingEditor.redraw();
    },
    
    // Phase 3C Storyboard : retourne l'index de l'objet (ou -1) sous le point (canvasX, canvasY) dans la zone courante
    // Parcourt à l'envers pour que les objets dessinés en dernier soient prioritaires (au-dessus)
    // v595 : un objet n'est manipulable (clic, drag, poignées) que depuis le
    // calque auquel il appartient. Un objet orphelin (calque d'origine
    // supprimé, ou ancien projet sans layerId) reste manipulable partout,
    // faute de calque à qui le rattacher.
    _isObjectOnActiveLayer: (obj) => {
        const activeLayer = DrawingEditor.layers[DrawingEditor.currentLayerIndex];
        if(!activeLayer) return false;
        if(!obj.layerId) return true;
        if(obj.layerId === activeLayer.id) return true;
        const stillExists = DrawingEditor.layers.some(l => l.id === obj.layerId);
        return !stillExists;
    },
    
    findObjectAt: (canvasX, canvasY) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return -1;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return -1;
        
        for(let i = zone.objects.length - 1; i >= 0; i--) {
            const obj = zone.objects[i];
            if(!DrawingEditor._isObjectOnActiveLayer(obj)) continue;
            const x = obj.x || 0;
            const y = obj.y || 0;
            const scale = obj.scale || 1;
            const rotation = obj.rotation || 0;
            
            // Phase 4B v2 : dimensions selon le type
            // - SVG/emoji : 48×48 (baseSize)
            // - image : width×height natifs stockés sur l'objet
            let halfW, halfH;
            if(obj.type === 'image') {
                halfW = ((obj.width || 100) * scale) / 2 + 4;
                halfH = ((obj.height || 100) * scale) / 2 + 4;
            } else {
                halfW = (48 * scale) / 2 + 4;
                halfH = halfW;
            }
            
            // Si l'objet a une rotation, on transforme le point cliqué dans son repère local
            if(rotation) {
                const dx = canvasX - x;
                const dy = canvasY - y;
                const angle = -(rotation * Math.PI / 180);
                const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
                const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
                if(Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) return i;
            } else {
                if(canvasX >= x - halfW && canvasX <= x + halfW 
                   && canvasY >= y - halfH && canvasY <= y + halfH) {
                    return i;
                }
            }
        }
        return -1;
    },
    
    // ===================== OUTILS, CALQUES & HISTORIQUE =====================
    setTool: (tool) => {
        DrawingEditor.currentTool = tool;
        document.querySelectorAll('.drawing-sidebar .brush-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
    },
    
    setBrushSize: (size) => {
        // Phase 4B v2 : clamp 1-100 et stocker
        const n = parseInt(size);
        DrawingEditor.brushSize = isNaN(n) ? 10 : Math.max(1, Math.min(100, n));
    },
    
    setOpacity: (value) => {
        // Phase 4B v2 : clamp 0-100 et stocker
        const n = parseInt(value);
        DrawingEditor.opacity = isNaN(n) ? 100 : Math.max(0, Math.min(100, n));
        // Mettre à jour le label legacy s'il existe
        const label = document.getElementById('opacityValue');
        if(label) label.innerText = DrawingEditor.opacity + '%';
    },
    
    // Phase 4B v2 : helper pour snapper à un multiple de 5 le plus proche dans la direction du delta
    // Exemple : value=33, delta=+5 → 35 (plus proche supérieur). value=33, delta=-5 → 30.
    // Exemple : value=35, delta=+5 → 40. value=35, delta=-5 → 30.
    _snapToFive: (value, delta) => {
        const v = parseInt(value) || 0;
        if(v % 5 === 0) {
            // Déjà un multiple de 5 : on ajoute simplement le delta
            return v + delta;
        }
        // Pas un multiple de 5 : on snappe au multiple supérieur ou inférieur selon la direction
        if(delta > 0) {
            return Math.ceil(v / 5) * 5;
        } else {
            return Math.floor(v / 5) * 5;
        }
    },
    
    // Phase 4B v2 : ajuste la taille du trait avec snap à 5 (clamp 1-100)
    adjustBrushSize: (delta) => {
        const input = document.getElementById('drawBrushSize');
        if(!input) return;
        const newValue = Math.max(1, Math.min(100, DrawingEditor._snapToFive(input.value, delta)));
        input.value = newValue;
        DrawingEditor.setBrushSize(newValue);
    },
    
    // Phase 4B v2 : ajuste l'opacité avec snap à 5 (clamp 0-100)
    adjustOpacity: (delta) => {
        const input = document.getElementById('opacitySlider');
        if(!input) return;
        const newValue = Math.max(0, Math.min(100, DrawingEditor._snapToFive(input.value, delta)));
        input.value = newValue;
        DrawingEditor.setOpacity(newValue);
    },
    
    addLayer: () => {
        const newLayer = DrawingEditor.createNewLayer();
        DrawingEditor.layers.push(newLayer);
        DrawingEditor.currentLayerIndex = DrawingEditor.layers.length - 1;
        DrawingEditor.selectedObjectIdx = -1;
        DrawingEditor.renderLayers();
        DrawingEditor.saveState();
    },
    
    deleteLayer: async (idx) => {
        if(DrawingEditor.layers.length === 1) {
            Utils.toast('Impossible de supprimer le dernier calque', 'warning');
            return;
        }
        
        if(await ConfirmModal.confirmDelete("Ce calque sera supprimé.")) {
            const removedLayerId = DrawingEditor.layers[idx].id;
            DrawingEditor.layers.splice(idx, 1);
            
            // Les objets (images insérées) qui appartenaient à ce calque doivent
            // disparaître avec lui — sinon ils restent affichés sans calque.
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot?.drawings?.[DrawingEditor.currentKind];
            if(zone && Array.isArray(zone.objects)) {
                zone.objects = zone.objects.filter(o => o.layerId !== removedLayerId);
            }
            
            if(DrawingEditor.currentLayerIndex >= DrawingEditor.layers.length) {
                DrawingEditor.currentLayerIndex = DrawingEditor.layers.length - 1;
            }
            DrawingEditor.selectedObjectIdx = -1;
            if(DrawingEditor.currentKind !== 'original') DrawingEditor.renderObjectsPalette();
            DrawingEditor.renderLayers();
            DrawingEditor.redraw();
            DrawingEditor.saveState();
        }
    },
    
    toggleLayerVisibility: (idx) => {
        DrawingEditor.layers[idx].visible = !DrawingEditor.layers[idx].visible;
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
    },
    
    clear: async () => {
        if(!await ConfirmModal.confirmDelete("Tout le dessin sera effacé.", "Effacer tout ?")) return;
        
        const layer = DrawingEditor.layers[DrawingEditor.currentLayerIndex];
        const ctx = layer.canvas.getContext('2d');
        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        
        // "Effacer tout" doit aussi retirer les objets (images insérées) posés
        // sur ce calque — sinon ils restent affichés alors que le calque est vide.
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        const zone = shot?.drawings?.[DrawingEditor.currentKind];
        if(zone && Array.isArray(zone.objects)) {
            zone.objects = zone.objects.filter(o => o.layerId !== layer.id);
        }
        DrawingEditor.selectedObjectIdx = -1;
        if(DrawingEditor.currentKind !== 'original') DrawingEditor.renderObjectsPalette();
        
        DrawingEditor.redraw();
        DrawingEditor.saveState();
    },
    
    saveState: () => {
        // Remove future history if we're not at the end
        if(DrawingEditor.historyStep < DrawingEditor.history.length - 1) {
            DrawingEditor.history = DrawingEditor.history.slice(0, DrawingEditor.historyStep + 1);
        }
        
        // Save current state
        const state = DrawingEditor.layers.map(layer => {
            return {
                id: layer.id,
                visible: layer.visible,
                name: layer.name,
                imageData: layer.canvas.toDataURL()
            };
        });
        
        DrawingEditor.history.push(state);
        DrawingEditor.historyStep++;
        
        // Limit history to 50 steps
        if(DrawingEditor.history.length > 50) {
            DrawingEditor.history.shift();
            DrawingEditor.historyStep--;
        }
        
        // v595 : rafraîchir les vignettes de la colonne calques
        DrawingEditor.renderLayers();
    },
    
    undo: () => {
        if(DrawingEditor.historyStep > 0) {
            DrawingEditor.historyStep--;
            DrawingEditor.restoreState(DrawingEditor.history[DrawingEditor.historyStep]);
        }
    },
    
    redo: () => {
        if(DrawingEditor.historyStep < DrawingEditor.history.length - 1) {
            DrawingEditor.historyStep++;
            DrawingEditor.restoreState(DrawingEditor.history[DrawingEditor.historyStep]);
        }
    },
    
    restoreState: (state) => {
        DrawingEditor.layers = state.map(layerState => {
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 600;
            const ctx = canvas.getContext('2d');
            
            const img = new Image();
            // [Phase C.2.6 fix] crossOrigin obligatoire sur images HTTP Storage
            if(typeof layerState.imageData === 'string' && layerState.imageData.startsWith('http')) {
                img.crossOrigin = 'anonymous';
            }
            img.src = Utils.signedUrlFor(layerState.imageData);
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                DrawingEditor.redraw();
            };
            
            return {
                id: layerState.id,
                canvas: canvas,
                visible: layerState.visible,
                name: layerState.name
            };
        });
        
        DrawingEditor.renderLayers();
    },
    
    // ===================== SAUVEGARDE & RENDU =====================
    // v616 : upload des calques + écriture dans shot.drawings, SANS toucher au
    // réseau projet (Store.save()). Isolé de save() pour pouvoir committer le
    // dessin en mémoire depuis la fenêtre "Édition Plan" sans déclencher une
    // deuxième sauvegarde réseau indépendante de la sienne (cf close()).
    _commitDrawingData: async () => {
        if(!DrawingEditor.currentShotId) return false;
        
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return false;
        
        // Phase 2 Storyboard : garde-fou de permission au moment de la sauvegarde
        const kind = DrawingEditor.currentKind || 'original';
        const isOwner = state.currentRole === 'owner';
        const permKey = (kind === 'original') ? 'storyboard' : ('storyboard_' + kind);
        if(!isOwner && !Permissions.canEdit(permKey)) {
            const labels = { original: 'le dessin original', lighting: 'la zone Lumière', camera: 'la zone Caméra', actors: 'la zone Acteurs' };
            Utils.toast(`Permission insuffisante pour modifier ${labels[kind] || 'cette zone'}.`, 'error');
            return false;
        }
        
        // Convert layers to serializable format
        // Upload de chaque calque vers Storage (upsert : écrasement du même chemin)
        const shotId = DrawingEditor.currentShotId;
        const layerUploads = await Promise.all(DrawingEditor.layers.map(async (layer) => {
            const dataUrl = layer.canvas.toDataURL();
            const filePath = `${state.currentProjectId}/storyboard/${shotId}_${kind}_layer_${layer.id}.png`;
            const url = await Utils.uploadDataUrl(dataUrl, filePath, true);
            return {
                id: layer.id,
                visible: layer.visible,
                name: layer.name,
                imageData: url || dataUrl  // fallback base64 si upload échoue
            };
        }));
        const drawingData = {
            layers: layerUploads,
            currentLayer: DrawingEditor.currentLayerIndex
        };
        
        // Phase 1 Storyboard : écrire dans la zone correspondante
        if(!shot.drawings) {
            shot.drawings = { original: null, lighting: null, camera: null, actors: null };
        }
        // Phase 3 Storyboard : préserver les objets vectoriels existants dans la zone
        const existingObjects = (shot.drawings[kind] && Array.isArray(shot.drawings[kind].objects))
            ? shot.drawings[kind].objects
            : [];
        shot.drawings[kind] = {
            imageType: 'drawing',
            imageUrl: null,
            drawingData: drawingData,
            objects: existingObjects  // Phase 3 : tableau d'objets vectoriels persistés
        };
        
        // Compat backwards : pour 'original' on continue d'alimenter les champs racine
        // (utilisés par l'aperçu compact, l'export PDF, etc.)
        if(kind === 'original') {
            shot.imageType = 'drawing';
            shot.drawingData = drawingData;
        }
        shot.lastModified = Date.now();
        return true;
    },

    // Chemin autonome (dessin ouvert hors fenêtre "Édition Plan") : committer PUIS
    // pousser au serveur soi-même, personne d'autre ne le fera.
    save: async () => {
        Utils.toast('Sauvegarde en cours...', 'info', 2000);
        const kind = DrawingEditor.currentKind || 'original';
        const ok = await DrawingEditor._commitDrawingData();
        if(!ok) return;
        
        Store.save();
        Storyboard.renderShots();
        const zoneLabel = { original: 'Dessin', lighting: 'Lumière', camera: 'Caméra', actors: 'Acteurs' }[kind] || 'Dessin';
        Utils.toast(zoneLabel + ' sauvegardé !', 'success');
    },
    
    // v599 — DEUX DEFAUTS CORRIGES ICI, tous deux invisibles tant que les
    // calques arrivaient vite :
    //  1. CANVAS ORPHELIN. Le contexte etait capture a l'appel, mais les calques
    //     se dessinent APRES leur telechargement. Si la liste des plans est
    //     redessinee entre-temps — changement de scene, retour d'onglet, simple
    //     second rendu — la peinture atterrit dans un canvas retire du document :
    //     la vignette reste vide POUR TOUJOURS, jusqu'au prochain rendu. D'ou
    //     « les miniatures n'apparaissent qu'apres avoir clique sur une fiche ».
    //     On accepte donc un identifiant de canvas et on le RETROUVE au moment
    //     de peindre, jamais avant.
    //  2. ORDRE D'EMPILEMENT. Les calques partaient tous en parallele et se
    //     dessinaient dans leur ordre d'ARRIVEE : un calque lourd place dessous
    //     pouvait recouvrir ceux du dessus. Ils sont desormais dessines l'un
    //     apres l'autre, dans l'ordre du dessin.
    renderDrawingData: async (ctx, drawingData, canvasId) => {
        if(!drawingData || !Array.isArray(drawingData.layers)) return;
        const cible = () => {
            if(!canvasId) return ctx;
            const c = document.getElementById(canvasId);
            return c ? c.getContext('2d') : null;
        };
        for(const layerData of drawingData.layers) {
            if(!layerData || !layerData.visible) continue;
            const img = new Image();
            await StoryboardExport._loadPrintImg(img, layerData.imageData, () => {
                const c = cible();
                if(c) c.drawImage(img, 0, 0);
            });
        }
    }
};


  // Module Import Scénario (depuis l'onglet scénario)