
  const ActionsExport = {
      // ============================================================
      // ===== EXPORT PDF UNIVERSEL [Phase D] =====
      // ============================================================
      // openExportModal : ouvre la modale unique
      // confirmExportPDF : récolte les choix, boucle sur les sections cochées
      //                    et déclenche chaque export en séquentiel.
      //                    Chaque section produit son propre PDF téléchargé.
      //                    En cas d'erreur sur une section, on continue les autres.
      
      openExportModal: (focusSection) => { 
          els.exportModal.style.display = 'flex';
          // v578 (cloisonnement) : on masque les lignes des onglets fermes. Sans ce
          // filtre, un membre qui n'a pas acces au Budget verrait quand meme la case
          // « Budget » et obtiendrait un PDF vide — un document faux, ce qui est pire
          // qu'un document absent : rien ne lui dirait que le budget existe ailleurs.
          // On decoche aussi, sinon « Tout cocher » les rembarquerait.
          ActionsExport.expApplyPermissions();
          // [Rapports script] Peupler la liste des scènes ayant des fiches
          if(Actions.expPopulateSrScenes) Actions.expPopulateSrScenes();
          // [Séquencier] Peupler les cases de saisons (séries uniquement)
          ActionsExport.expPopulateBoardSeasons();
          // [Storyboard] Étiquette du bouton Options (mise en page / calque) et du bouton de scènes
          ActionsExport._updateStoryboardOptionsLabel();
          ActionsExport._updateStoryboardScenesLabel();
          // [Planning] Étiquette du bouton de sélection de jours (reflète un filtre déjà posé)
          ActionsExport._updatePlanningDaysLabel();
          // [Mood Board] Étiquette du bouton de sélection de planches (reflète un filtre déjà posé)
          ActionsExport._updateMoodboardBoardsLabel();
          // Étiquettes des boutons Options (mode et cases à cocher) sur toutes les lignes concernées
          Object.keys(ActionsExport._modeState).forEach(k => ActionsExport._updateModeOptionsLabel(k));
          Object.keys(ActionsExport._checkState).forEach(k => ActionsExport._updateCheckOptionsLabel(k));
          // Appliquer l'ordre custom mémorisé (si présent) avant de poser le drag
          if(Actions.expRestoreOrder) Actions.expRestoreOrder();
          // Repliage des groupes : ouvert depuis le bouton d'un onglet précis (focusSection
          // fourni) -> tout replié sauf le groupe de cette section ; ouvert depuis le menu
          // du haut (Fichier > Export, sans argument) -> tout déplié, comme avant.
          const groups = document.querySelectorAll('#export-modal .exp-group');
          if(focusSection) {
              const focusRow = document.querySelector(`#export-modal .exp-section-row[data-section="${focusSection}"]`);
              const focusGroup = focusRow ? focusRow.closest('.exp-group') : null;
              groups.forEach(g => g.classList.toggle('is-folded', g !== focusGroup));
          } else {
              groups.forEach(g => g.classList.remove('is-folded'));
          }
          // Brancher le drag & drop (idempotent : peut être rappelé plusieurs fois)
          Actions.expSetupDragAndDrop();
      },
      
      // Replie/déplie un groupe au clic sur son titre.
      expToggleGroupFold: (e) => {
          const group = e.target.closest('.exp-group');
          if(group) group.classList.toggle('is-folded');
      },
      
      // ===== [Storyboard] Sélection des scènes à inclure (popup à part : la case
      // à cocher ne suffit pas à choisir un sous-ensemble, mais ça ne mérite pas
      // de gonfler la ligne du hub avec une liste de scènes en permanence). =====
      _sbSceneIds: null, // null = toutes les scènes
      expOpenStoryboardScenes: (e) => {
          if(e) e.stopPropagation();
          const shots = state.data.shots || [];
          const scenesWithShots = (state.data.scenes || [])
              .map((s, i) => ({ s: s, i: i, n: shots.filter(sh => sh.sceneId === s.id).length }))
              .filter(x => x.n > 0);
          if(scenesWithShots.length === 0) { Utils.toast('Aucun plan dans ce projet', 'warning'); return; }
          const selected = ActionsExport._sbSceneIds;
          const rows = scenesWithShots.map(x => {
              const checked = !selected || selected.includes(x.s.id);
              return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:0.85rem;"><input type="checkbox" class="exp-sb-scene-chk" data-scene-id="${Utils.escape(x.s.id)}" ${checked ? 'checked' : ''} style="margin:0;width:auto;"> ${(x.i + 1)}. ${Utils.escape(x.s.title || 'Sans titre')} <span style="color:var(--text-sec);font-size:0.75rem;">(${x.n} plan${x.n > 1 ? 's' : ''})</span></label>`;
          }).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;max-height:80vh;overflow-y:auto;">
              <div style="font-size:1rem;font-weight:bold;margin-bottom:12px;">🎬 Scènes du Storyboard à inclure</div>
              <div style="display:flex;gap:6px;margin-bottom:10px;">
                  <button type="button" class="confirm-modal-btn" id="exp-sb-scenes-all" style="margin:0;padding:4px 10px;font-size:0.75rem;">Toutes</button>
                  <button type="button" class="confirm-modal-btn" id="exp-sb-scenes-none" style="margin:0;padding:4px 10px;font-size:0.75rem;">Aucune</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;margin-bottom:14px;">${rows}</div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn confirm" id="exp-sb-scenes-ok" style="margin:0;">OK</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.querySelector('#exp-sb-scenes-all').onclick = () => overlay.querySelectorAll('.exp-sb-scene-chk').forEach(cb => cb.checked = true);
          overlay.querySelector('#exp-sb-scenes-none').onclick = () => overlay.querySelectorAll('.exp-sb-scene-chk').forEach(cb => cb.checked = false);
          overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
          overlay.querySelector('#exp-sb-scenes-ok').onclick = () => {
              const all = Array.from(overlay.querySelectorAll('.exp-sb-scene-chk'));
              const checkedIds = all.filter(cb => cb.checked).map(cb => cb.dataset.sceneId);
              ActionsExport._sbSceneIds = (checkedIds.length === all.length) ? null : checkedIds;
              overlay.remove();
              ActionsExport._updateStoryboardScenesLabel();
          };
      },
      // ===== [Storyboard] Mise en page / calque technique : regroupés dans un
      // bouton Options plutôt qu'affichés en permanence (trop de contrôles
      // pour tenir sur une ligne). =====
      _sbLayout: 'standard',
      _sbImageOnly: false,
      _sbTechLayer: 'none',
      expOpenStoryboardOptions: (e) => {
          if(e) e.stopPropagation();
          const layouts = [
              { v: 'standard', l: 'Standard (4/page)' },
              { v: 'large',    l: 'Image en grand (1/page)' },
              { v: 'compact',  l: 'Compact' }
          ];
          const techs = [
              { v: 'none',     l: 'Aucun calque' },
              { v: 'lighting', l: '💡 Lumière' },
              { v: 'camera',   l: '📷 Caméra' },
              { v: 'actors',   l: '🎭 Acteurs' }
          ];
          const btnsHtml = (arr, name, current) => arr.map(o =>
              `<button type="button" class="fmt-btn ${o.v === current ? 'active' : ''}" data-${name}="${o.v}" style="padding:8px 12px;font-size:0.82rem;text-align:left;">${o.l}</button>`
          ).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
              <div style="font-size:1rem;font-weight:bold;margin-bottom:12px;">⚙️ Storyboard — Options</div>
              <div style="text-align:left;font-size:0.8rem;color:var(--text-sec);margin-bottom:8px;">Mise en page :</div>
              <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;" id="exp-sb-opt-layout">${btnsHtml(layouts, 'layout', ActionsExport._sbLayout)}</div>
              <label class="exp-suboption" style="margin-bottom:12px;" title="Image seule, sans détails techniques"><input type="checkbox" id="exp-sb-opt-imageonly" ${ActionsExport._sbImageOnly ? 'checked' : ''}><span>Image seule</span></label>
              <div style="text-align:left;font-size:0.8rem;color:var(--text-sec);margin-bottom:8px;">Calque technique :</div>
              <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;" id="exp-sb-opt-tech">${btnsHtml(techs, 'tech', ActionsExport._sbTechLayer)}</div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn confirm" id="exp-sb-opt-ok" style="margin:0;">OK</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.querySelectorAll('#exp-sb-opt-layout .fmt-btn').forEach(b => b.onclick = () => {
              overlay.querySelectorAll('#exp-sb-opt-layout .fmt-btn').forEach(x => x.classList.remove('active'));
              b.classList.add('active');
          });
          overlay.querySelectorAll('#exp-sb-opt-tech .fmt-btn').forEach(b => b.onclick = () => {
              overlay.querySelectorAll('#exp-sb-opt-tech .fmt-btn').forEach(x => x.classList.remove('active'));
              b.classList.add('active');
          });
          overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
          overlay.querySelector('#exp-sb-opt-ok').onclick = () => {
              ActionsExport._sbLayout = overlay.querySelector('#exp-sb-opt-layout .fmt-btn.active')?.dataset.layout || 'standard';
              ActionsExport._sbImageOnly = overlay.querySelector('#exp-sb-opt-imageonly')?.checked || false;
              ActionsExport._sbTechLayer = overlay.querySelector('#exp-sb-opt-tech .fmt-btn.active')?.dataset.tech || 'none';
              overlay.remove();
              ActionsExport._updateStoryboardOptionsLabel();
          };
      },
      _updateStoryboardOptionsLabel: () => {
          const btn = document.getElementById('exp-storyboard-options-btn');
          if(!btn) return;
          const isDefault = ActionsExport._sbLayout === 'standard' && !ActionsExport._sbImageOnly && ActionsExport._sbTechLayer === 'none';
          btn.textContent = isDefault ? '⚙️ Options…' : '⚙️ Options (modifiées)';
      },
      
      _updateStoryboardScenesLabel: () => {
          const btn = document.getElementById('exp-storyboard-scenes-btn');
          if(!btn) return;
          const sel = ActionsExport._sbSceneIds;
          btn.textContent = sel ? `🎬 Scènes (${sel.length})` : '🎬 Scènes…';
      },
      
      // ===== [Planning] Sélection des jours de tournage à inclure (même
      // principe que les scènes du Storyboard : popup à part). =====
      _planningDayIds: null, // null = tous les jours
      expOpenPlanningDays: (e) => {
          if(e) e.stopPropagation();
          const days = state.data.shootingDays || [];
          if(days.length === 0) { Utils.toast('Aucun jour de tournage', 'warning'); return; }
          const sorted = [...days].sort((a, b) => {
              const da = new Date(a.startDate || a.date || 0);
              const db = new Date(b.startDate || b.date || 0);
              return da - db;
          });
          const selected = ActionsExport._planningDayIds;
          const items = sorted.map(d => {
              const startDate = d.startDate || d.date;
              const dateObj = startDate ? new Date(startDate) : null;
              const dateStr = dateObj && !isNaN(dateObj)
                  ? dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                  : '(date non définie)';
              const dayName = Planning.dayLabel(d);
              const validBadge = d.validated ? '<span style="background:var(--success);color:#fff;padding:1px 6px;border-radius:4px;font-size:0.7rem;margin-left:6px;">✅ Validé</span>' : '';
              const checked = !selected || selected.includes(d.id);
              return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()">
                  <td style="width:24px;padding:5px 8px;vertical-align:middle;"><input type="checkbox" class="exp-pl-day-chk" value="${d.id}" ${checked ? 'checked' : ''} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td>
                  <td style="padding:5px 8px;font-size:0.85rem;line-height:1.3;vertical-align:middle;"><strong>${Utils.escape(dayName)}</strong> — ${dateStr}${validBadge}</td>
              </tr>`;
          }).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:480px;padding:20px;max-height:80vh;overflow-y:auto;">
              <div style="font-size:1rem;font-weight:bold;margin-bottom:12px;">📅 Jours de tournage à inclure</div>
              <div style="display:flex;gap:6px;margin-bottom:10px;">
                  <button type="button" id="exp-pl-days-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                  <button type="button" id="exp-pl-days-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
                  <button type="button" id="exp-pl-days-validated" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">✅ Validés</button>
              </div>
              <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:14px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn confirm" id="exp-pl-days-ok" style="margin:0;">OK</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.querySelector('#exp-pl-days-all').onclick = () => overlay.querySelectorAll('.exp-pl-day-chk').forEach(cb => cb.checked = true);
          overlay.querySelector('#exp-pl-days-none').onclick = () => overlay.querySelectorAll('.exp-pl-day-chk').forEach(cb => cb.checked = false);
          overlay.querySelector('#exp-pl-days-validated').onclick = () => {
              const validIds = new Set(sorted.filter(d => d.validated).map(d => d.id));
              overlay.querySelectorAll('.exp-pl-day-chk').forEach(cb => { cb.checked = validIds.has(cb.value); });
          };
          overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
          overlay.querySelector('#exp-pl-days-ok').onclick = () => {
              const all = Array.from(overlay.querySelectorAll('.exp-pl-day-chk'));
              const checkedIds = all.filter(cb => cb.checked).map(cb => cb.value);
              ActionsExport._planningDayIds = (checkedIds.length === all.length) ? null : checkedIds;
              overlay.remove();
              ActionsExport._updatePlanningDaysLabel();
          };
      },
      _updatePlanningDaysLabel: () => {
          const btn = document.getElementById('exp-planning-days-btn');
          if(!btn) return;
          const sel = ActionsExport._planningDayIds;
          btn.textContent = sel ? `📅 Jours (${sel.length})` : '📅 Jours…';
      },
      
      // ===== [Mood Board] Sélection des planches à inclure (même principe). =====
      _mbBoardIds: null, // null = toutes les planches
      expOpenMoodboardBoards: (e) => {
          if(e) e.stopPropagation();
          const boards = state.data.moodboards || [];
          if(boards.length === 0) { Utils.toast('Aucune planche', 'warning'); return; }
          const selected = ActionsExport._mbBoardIds;
          const rows = boards.map(b => {
              const checked = !selected || selected.includes(b.id);
              return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:0.85rem;"><input type="checkbox" class="exp-mb-board-chk" data-board-id="${Utils.escape(b.id)}" ${checked ? 'checked' : ''} style="margin:0;width:auto;"> ${Utils.escape(b.name || 'Planche')}</label>`;
          }).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;max-height:80vh;overflow-y:auto;">
              <div style="font-size:1rem;font-weight:bold;margin-bottom:12px;">🎨 Planches Mood Board à inclure</div>
              <div style="display:flex;gap:6px;margin-bottom:10px;">
                  <button type="button" class="confirm-modal-btn" id="exp-mb-boards-all" style="margin:0;padding:4px 10px;font-size:0.75rem;">Toutes</button>
                  <button type="button" class="confirm-modal-btn" id="exp-mb-boards-none" style="margin:0;padding:4px 10px;font-size:0.75rem;">Aucune</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;margin-bottom:14px;">${rows}</div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn confirm" id="exp-mb-boards-ok" style="margin:0;">OK</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.querySelector('#exp-mb-boards-all').onclick = () => overlay.querySelectorAll('.exp-mb-board-chk').forEach(cb => cb.checked = true);
          overlay.querySelector('#exp-mb-boards-none').onclick = () => overlay.querySelectorAll('.exp-mb-board-chk').forEach(cb => cb.checked = false);
          overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
          overlay.querySelector('#exp-mb-boards-ok').onclick = () => {
              const all = Array.from(overlay.querySelectorAll('.exp-mb-board-chk'));
              const checkedIds = all.filter(cb => cb.checked).map(cb => cb.dataset.boardId);
              ActionsExport._mbBoardIds = (checkedIds.length === all.length) ? null : checkedIds;
              overlay.remove();
              ActionsExport._updateMoodboardBoardsLabel();
          };
      },
      _updateMoodboardBoardsLabel: () => {
          const btn = document.getElementById('exp-moodboard-boards-btn');
          if(!btn) return;
          const sel = ActionsExport._mbBoardIds;
          btn.textContent = sel ? `🎨 Planches (${sel.length})` : '🎨 Planches…';
      },
      
      // ===== Bouton Options générique n°1 : choix de mode (radio, façon
      // Détaillé / Liste / Fiche), utilisé par Personnages, Comédiens, Décors,
      // Équipe, Asso/Entreprises, Ressources, Budget. =====
      _modeState: { chars: 'detailed', actors: 'detailed', locs: 'detailed', crew: 'detailed', orgs: 'detailed', resources: 'detailed', budget: 'simple' },
      _modeChoices: {
          chars:     [{ v: 'detailed', l: 'Détaillé' }, { v: 'list', l: 'Liste' }, { v: 'card', l: 'Fiche/page' }],
          actors:    [{ v: 'detailed', l: 'Détaillé' }, { v: 'list', l: 'Liste' }, { v: 'card', l: 'Fiche/page' }],
          locs:      [{ v: 'detailed', l: 'Détaillé' }, { v: 'list', l: 'Liste' }, { v: 'card', l: 'Fiche+photos' }],
          crew:      [{ v: 'detailed', l: 'Détaillé' }, { v: 'list', l: 'Liste' }, { v: 'card', l: 'Fiche/page' }],
          orgs:      [{ v: 'detailed', l: 'Détaillé' }, { v: 'list', l: 'Liste' }, { v: 'card', l: 'Fiche/page' }],
          resources: [{ v: 'detailed', l: 'Détaillé' }, { v: 'list', l: 'Liste' }, { v: 'card', l: 'Fiche/page' }],
          budget:    [{ v: 'simple',   l: 'Simple' },   { v: 'detailed', l: 'Détaillé' }]
      },
      _modeTitles: { chars: 'Personnages', actors: 'Comédiens', locs: 'Décors', crew: 'Équipe', orgs: 'Asso / Entreprises', resources: 'Ressources', budget: 'Budget' },
      expOpenModeOptions: (key, e) => {
          if(e) e.stopPropagation();
          const choices = ActionsExport._modeChoices[key];
          const current = ActionsExport._modeState[key];
          const btnsHtml = choices.map(o => `<button type="button" class="fmt-btn ${o.v === current ? 'active' : ''}" data-mode="${o.v}" style="padding:8px 12px;font-size:0.82rem;text-align:left;">${o.l}</button>`).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:380px;padding:20px;">
              <div style="font-size:1rem;font-weight:bold;margin-bottom:12px;">⚙️ ${ActionsExport._modeTitles[key]} — Options</div>
              <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;" id="exp-mode-opt-list">${btnsHtml}</div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn confirm" id="exp-mode-opt-ok" style="margin:0;">OK</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.querySelectorAll('#exp-mode-opt-list .fmt-btn').forEach(b => b.onclick = () => {
              overlay.querySelectorAll('#exp-mode-opt-list .fmt-btn').forEach(x => x.classList.remove('active'));
              b.classList.add('active');
          });
          overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
          overlay.querySelector('#exp-mode-opt-ok').onclick = () => {
              ActionsExport._modeState[key] = overlay.querySelector('#exp-mode-opt-list .fmt-btn.active')?.dataset.mode || current;
              overlay.remove();
              ActionsExport._updateModeOptionsLabel(key);
          };
      },
      _updateModeOptionsLabel: (key) => {
          const btn = document.getElementById('exp-' + key + '-options-btn');
          if(!btn) return;
          const defaultVal = ActionsExport._modeChoices[key][0].v;
          btn.textContent = (ActionsExport._modeState[key] === defaultVal) ? '⚙️ Options…' : '⚙️ Options (modifiées)';
      },
      
      // ===== Bouton Options générique n°2 : liste de cases à cocher, utilisé
      // par Synopsis, Scénario, Planning (feuille de service). =====
      _checkState: {
          synopsis: { short: true, long: true, main: true, intent: true, director: true, producer: true },
          script: { numbers: true, notes: false },
          planning: { callsheet: true },
          // Le plan de travail entre au hub avec le choix de ses tableaux :
          // on ne distribue pas les memes a la production et a la regie.
          workplan: { journees: true, decors: true, presences: true }
      },
      _checkDefs: {
          synopsis: [
              { k: 'short', l: 'Résumé court' }, { k: 'long', l: 'Résumé long' }, { k: 'main', l: 'Synopsis principal' },
              { k: 'intent', l: "Note d'intention" }, { k: 'director', l: 'Note du réalisateur' }, { k: 'producer', l: 'Note du producteur' }
          ],
          script: [
              { k: 'numbers', l: 'Numéroter les scènes (#1, #2…)' }, { k: 'notes', l: 'Notes de production' }
          ],
          planning: [
              { k: 'callsheet', l: 'Feuille de service (convocations détaillées)' }
          ],
          workplan: [
              { k: 'journees',  l: 'Les journées (modèle horizontal)' },
              { k: 'decors',    l: 'Par décor' },
              { k: 'presences', l: 'Les présences (modèle vertical)' }
          ]
      },
      _checkTitles: { synopsis: 'Synopsis', script: 'Scénario', planning: 'Planning',
                      workplan: 'Plan de travail' },
      // ON ANNONCE LE PAPIER AVANT DE GENERER. Un tableau de quarante
      // colonnes sorti sur A4 donne des caracteres de deux millimetres :
      // illisible, donc jete. Le libelle dit sa taille et sa feuille, et le
      // PDF sort en A3 paysage tout seul quand il le faut.
      expOpenWorkplanOptions: (e) => {
          const base = { journees: 'Les journées (modèle horizontal)', decors: 'Par décor',
                         presences: 'Les présences (modèle vertical)' };
          ActionsExport._checkDefs.workplan = Object.keys(base).map(k => {
              const f = (typeof PlanningBoards !== 'undefined') ? PlanningBoards.formatTableau(k) : null;
              const info = !f ? ' — vide'
                  : ' — ' + f.colonnes + ' colonnes, ' + f.lignes + ' ligne' + (f.lignes > 1 ? 's' : '')
                    + (f.papier === 'A3' ? ' → A3 paysage' : '');
              return { k: k, l: base[k] + info };
          });
          ActionsExport.expOpenCheckOptions('workplan', e);
      },
      expOpenCheckOptions: (key, e) => {
          if(e) e.stopPropagation();
          const defs = ActionsExport._checkDefs[key];
          const state = ActionsExport._checkState[key];
          const rows = defs.map(d => `<label class="exp-suboption" style="display:flex;width:100%;padding:8px 10px;box-sizing:border-box;"><input type="checkbox" data-k="${d.k}" ${state[d.k] ? 'checked' : ''} style="width:14px;height:14px;"><span style="margin-left:6px;">${d.l}</span></label>`).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:380px;padding:20px;">
              <div style="font-size:1rem;font-weight:bold;margin-bottom:12px;">⚙️ ${ActionsExport._checkTitles[key]} — Options</div>
              <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;" id="exp-check-opt-list">${rows}</div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn confirm" id="exp-check-opt-ok" style="margin:0;">OK</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
          overlay.querySelector('#exp-check-opt-ok').onclick = () => {
              overlay.querySelectorAll('#exp-check-opt-list input[type="checkbox"]').forEach(cb => { state[cb.dataset.k] = cb.checked; });
              overlay.remove();
              ActionsExport._updateCheckOptionsLabel(key);
          };
      },
      _updateCheckOptionsLabel: (key) => {
          const btn = document.getElementById('exp-' + key + '-options-btn');
          if(!btn) return;
          btn.textContent = '⚙️ Options…';
      },
      
      // v578 (cloisonnement) : correspondance ligne d'export -> section de droits.
      // Trois lignes n'ont volontairement pas de section : « Rapport de production »
      // et « Statistiques » sont des syntheses calculees a partir de ce qu'on a deja
      // le droit de voir, et la page de titre n'est plus dans la liste.
      EXPORT_SECTION: {
          synopsis: 'synopsis', board: 'sequencier', script: 'scenario',
          moodboard: 'moodboard', storyboard: 'storyboard',
          presentation: 'presentation', chars: 'personnages', actors: 'comediens',
          locs: 'lieux', breakdown: 'depouillement', crew: 'equipe', orgs: 'equipe',
          resources: 'ressources', planning: 'planning', workplan: 'planning',
          scriptreports: 'scriptreport', budget: 'depenses', stats: 'stats'
      },

      expApplyPermissions: () => {
          document.querySelectorAll('#export-modal .exp-section-row').forEach(row => {
              const sec = ActionsExport.EXPORT_SECTION[row.dataset.section];
              if(!sec) return;
              const ok = (typeof Permissions === 'undefined') || Permissions.canAccess(sec);
              row.style.display = ok ? '' : 'none';
              if(!ok) {
                  const chk = row.querySelector('.exp-section-chk');
                  if(chk) chk.checked = false;
              }
          });
      },

      // Toggle "Tout cocher" : bascule l'état en lisant data-active du bouton
      expToggleAll: () => {
          const btn = document.getElementById('exp-toggle-all');
          if(!btn) return;
          const newState = btn.dataset.active !== '1';
          btn.dataset.active = newState ? '1' : '0';
          document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
              cb.checked = newState;
          });
      },
      
      // Toggle "Pages de garde" : bascule l'état
      expToggleAllCovers: () => {
          const btn = document.getElementById('exp-toggle-covers');
          if(!btn) return;
          const newState = btn.dataset.active !== '1';
          btn.dataset.active = newState ? '1' : '0';
          document.querySelectorAll('#export-modal .exp-cover-chk').forEach(cb => {
              cb.checked = newState;
          });
      },
      
      // Toggle "PDF fusionné" : bascule l'état (utilisé par confirmExportPDF pour décider du mode)
      expToggleMerged: () => {
          const btn = document.getElementById('exp-toggle-merged');
          if(!btn) return;
          const newState = btn.dataset.active !== '1';
          btn.dataset.active = newState ? '1' : '0';
      },
      
      // [Rapports script] Affiche/masque la liste des scènes selon le scope choisi
      expToggleSrScenes: () => {
          const box = document.getElementById('exp-sr-scenes');
          if(!box) return;
          const scope = document.querySelector('input[name="exp-sr-scope"]:checked')?.value || 'all';
          box.style.display = scope === 'select' ? 'block' : 'none';
      },
      
      // [Séquencier] Peuple les cases de saisons à exporter (séries uniquement)
      // Reflète la case de saison dans le bouton (visible seulement projet série + saisons).
      _boardSeasonIds: null, // null = toutes les saisons
      expPopulateBoardSeasons: () => {
          const box = document.getElementById('exp-board-seasons');
          if(!box) return;
          const seasons = state.data.seasons || [];
          if(state.currentProjectType !== 'series' || seasons.length === 0) {
              box.style.display = 'none';
              box.innerHTML = '';
              return;
          }
          box.style.display = '';
          box.innerHTML = '<button type="button" class="exp-suboption" id="exp-board-seasons-btn" onclick="app.Actions.expOpenBoardSeasons(event)">📺 Saisons…</button>';
          ActionsExport._updateBoardSeasonsLabel();
      },
      expOpenBoardSeasons: (e) => {
          if(e) e.stopPropagation();
          const seasons = state.data.seasons || [];
          if(seasons.length === 0) { Utils.toast('Aucune saison', 'warning'); return; }
          const selected = ActionsExport._boardSeasonIds;
          const rows = seasons.map(s => {
              const label = 'S' + String(s.number).padStart(2, '0') + (s.title ? ' — ' + Utils.escape(s.title) : '');
              const checked = !selected || selected.includes(s.id);
              return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:0.85rem;"><input type="checkbox" class="exp-bs-season-chk" data-season-id="${Utils.escape(s.id)}" ${checked ? 'checked' : ''} style="margin:0;width:auto;"> ${label}</label>`;
          }).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:380px;padding:20px;max-height:80vh;overflow-y:auto;">
              <div style="font-size:1rem;font-weight:bold;margin-bottom:12px;">📺 Saisons du Séquencier à inclure</div>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;margin-bottom:14px;">${rows}</div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn confirm" id="exp-bs-ok" style="margin:0;">OK</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
          overlay.querySelector('#exp-bs-ok').onclick = () => {
              const all = Array.from(overlay.querySelectorAll('.exp-bs-season-chk'));
              const checkedIds = all.filter(cb => cb.checked).map(cb => cb.dataset.seasonId);
              ActionsExport._boardSeasonIds = (checkedIds.length === all.length) ? null : checkedIds;
              overlay.remove();
              ActionsExport._updateBoardSeasonsLabel();
          };
      },
      _updateBoardSeasonsLabel: () => {
          const btn = document.getElementById('exp-board-seasons-btn');
          if(!btn) return;
          const sel = ActionsExport._boardSeasonIds;
          btn.textContent = sel ? `📺 Saisons (${sel.length})` : '📺 Saisons…';
      },
      
      // [Rapports script] Peuple la liste des scènes ayant au moins une fiche
      expPopulateSrScenes: () => {
          const box = document.getElementById('exp-sr-scenes');
          if(!box) return;
          const reports = state.data.scriptReports || {};
          const keys = Object.keys(reports).filter(k => reports[k] && reports[k].length > 0);
          const allScenes = state.data.scenes || [];
          const withFiches = allScenes.filter(s => keys.some(k => k.startsWith(s.id + '_')));
          if(withFiches.length === 0) {
              box.innerHTML = '<span style="font-size:0.75rem;color:var(--text-sec);">Aucune fiche de script dans le projet</span>';
              return;
          }
          box.innerHTML = withFiches.map(scene => {
              const idx = allScenes.indexOf(scene);
              const num = UI.formatSceneNumber(scene, idx);
              const nb = keys.filter(k => k.startsWith(scene.id + '_')).reduce((acc, k) => acc + reports[k].length, 0);
              return `<label style="display:block;font-size:0.78rem;padding:2px 0;cursor:pointer;"><input type="checkbox" class="exp-sr-scene-chk" data-scene-id="${scene.id}" checked> Sc ${Utils.escape(String(num))} — ${Utils.escape(scene.title || '')} <span style="color:var(--text-sec);">(${nb} fiche${nb > 1 ? 's' : ''})</span></label>`;
          }).join('');
      },
      
      // [Phase D drag] Persistance de l'ordre custom (groupes + sous-sections)
      // L'ordre par défaut est mémorisé à la première ouverture (_expDefaultOrder),
      // ce qui permet de proposer un Reset propre sans reload.
      _expDefaultOrder: null,
      _EXP_ORDER_STORAGE_KEY: 'moteur.exportPdfOrder.v1',
      
      // Capture l'ordre courant du DOM sous forme JSON sérialisable
      _expReadOrderFromDOM: () => {
          const body = document.getElementById('exp-modal-body');
          if(!body) return null;
          const groups = [];
          body.querySelectorAll(':scope > .exp-group').forEach(g => {
              const groupKey = g.dataset.group;
              if(!groupKey) return;
              const sections = [];
              g.querySelectorAll(':scope > .exp-group-body > .exp-section-row').forEach(r => {
                  if(r.dataset.section) sections.push(r.dataset.section);
              });
              groups.push({ group: groupKey, sections });
          });
          return groups;
      },
      
      // Sauvegarde l'ordre actuel dans localStorage (appelé après chaque drop)
      expSaveOrder: () => {
          const order = Actions._expReadOrderFromDOM();
          if(!order) return;
          try {
              localStorage.setItem(Actions._EXP_ORDER_STORAGE_KEY, JSON.stringify(order));
          } catch(e) {
              console.warn('[Export PDF] Impossible de sauver l\'ordre :', e);
          }
      },
      
      // Restaure l'ordre depuis localStorage (appelé à l'ouverture de la modale)
      // Capture aussi l'ordre par défaut à la première exécution.
      expRestoreOrder: () => {
          const body = document.getElementById('exp-modal-body');
          if(!body) return;
          
          // Mémoriser l'ordre par défaut une seule fois
          if(!Actions._expDefaultOrder) {
              Actions._expDefaultOrder = Actions._expReadOrderFromDOM();
          }
          
          // Lire l'ordre custom
          let saved = null;
          try {
              const raw = localStorage.getItem(Actions._EXP_ORDER_STORAGE_KEY);
              if(raw) saved = JSON.parse(raw);
          } catch(e) {
              console.warn('[Export PDF] Impossible de lire l\'ordre sauvé :', e);
          }
          if(!saved || !Array.isArray(saved)) return;
          
          // Appliquer : pour chaque groupe dans l'ordre sauvé, le déplacer en fin de body,
          // et pour chaque section dans l'ordre sauvé, la déplacer en fin du group-body.
          // Les éléments non présents dans la sauvegarde gardent leur position relative
          // (utile si on ajoute une nouvelle section/groupe plus tard).
          saved.forEach(g => {
              const groupEl = body.querySelector(`:scope > .exp-group[data-group="${g.group}"]`);
              if(!groupEl) return;
              body.appendChild(groupEl); // remet à la fin dans l'ordre
              const groupBody = groupEl.querySelector(':scope > .exp-group-body');
              if(!groupBody || !Array.isArray(g.sections)) return;
              g.sections.forEach(secKey => {
                  const rowEl = groupBody.querySelector(`:scope > .exp-section-row[data-section="${secKey}"]`);
                  if(rowEl) groupBody.appendChild(rowEl);
              });
          });
      },
      
      // Restore l'ordre par défaut (efface localStorage) — accessible via bouton UI
      expResetOrder: async () => {
          if(typeof ConfirmModal !== 'undefined' && ConfirmModal.confirm) {
              const ok = await ConfirmModal.confirm({
                  title: 'Réinitialiser l\'ordre ?',
                  message: 'Remettre l\'ordre par défaut des sections d\'export PDF ?',
                  confirmText: 'Réinitialiser',
                  icon: '↩️'
              });
              if(!ok) return;
          }
          try { localStorage.removeItem(Actions._EXP_ORDER_STORAGE_KEY); } catch(e) {}
          
          // Appliquer l'ordre par défaut depuis la mémoire (sans reload)
          const body = document.getElementById('exp-modal-body');
          if(!body || !Actions._expDefaultOrder) return;
          Actions._expDefaultOrder.forEach(g => {
              const groupEl = body.querySelector(`:scope > .exp-group[data-group="${g.group}"]`);
              if(!groupEl) return;
              body.appendChild(groupEl);
              const groupBody = groupEl.querySelector(':scope > .exp-group-body');
              if(!groupBody || !Array.isArray(g.sections)) return;
              g.sections.forEach(secKey => {
                  const rowEl = groupBody.querySelector(`:scope > .exp-section-row[data-section="${secKey}"]`);
                  if(rowEl) groupBody.appendChild(rowEl);
              });
          });
          Utils.toast('Ordre par défaut restauré', 'success');
      },
      
      // [Phase D drag] Active le drag & drop sur les groupes et sous-sections
      // - Drag d'un groupe entier : réorganise l'ordre des groupes dans le body
      // - Drag d'une sous-section : réorganise dans son groupe d'origine uniquement
      //   (on n'autorise pas de déplacer une section dans un autre groupe pour garder la sémantique)
      // Persiste l'ordre dans localStorage après chaque drop.
      expSetupDragAndDrop: () => {
          const body = document.getElementById('exp-modal-body');
          if(!body) return;
          if(body.dataset.dragBound === '1') return; // idempotent
          body.dataset.dragBound = '1';
          
          let dragEl = null;
          let dragKind = null; // 'group' | 'row'
          let dragSourceGroup = null;
          
          const clearOverStates = () => {
              body.querySelectorAll('.exp-drag-over, .exp-drag-over-bottom').forEach(el => {
                  el.classList.remove('exp-drag-over', 'exp-drag-over-bottom');
              });
          };
          
          // Calcule si la souris est dans la moitié haute ou basse de l'élément cible
          const isBeforeMidpoint = (e, target) => {
              const rect = target.getBoundingClientRect();
              return (e.clientY - rect.top) < (rect.height / 2);
          };
          
          // ----- DRAGSTART -----
          body.addEventListener('dragstart', (e) => {
              const groupEl = e.target.closest('.exp-group');
              const rowEl = e.target.closest('.exp-section-row');
              // Priorité au row si on drag depuis une row (les rows sont dans les groupes)
              if(rowEl && rowEl.draggable) {
                  dragEl = rowEl;
                  dragKind = 'row';
                  dragSourceGroup = rowEl.closest('.exp-group');
              } else if(groupEl && groupEl.draggable) {
                  // Vérifier qu'on ne drag pas une row déguisée
                  if(rowEl) return;
                  dragEl = groupEl;
                  dragKind = 'group';
                  dragSourceGroup = null;
              } else {
                  return;
              }
              dragEl.classList.add('exp-dragging');
              try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKind); } catch(err) {}
          });
          
          // ----- DRAGOVER (sur le body, en délégation) -----
          body.addEventListener('dragover', (e) => {
              if(!dragEl) return;
              
              let target = null;
              if(dragKind === 'group') {
                  target = e.target.closest('.exp-group');
                  if(!target || target === dragEl) { clearOverStates(); return; }
              } else if(dragKind === 'row') {
                  target = e.target.closest('.exp-section-row');
                  if(!target || target === dragEl) { clearOverStates(); return; }
                  // Restriction : drag uniquement dans le groupe d'origine
                  if(target.closest('.exp-group') !== dragSourceGroup) { clearOverStates(); return; }
              }
              
              e.preventDefault(); // autorise le drop
              try { e.dataTransfer.dropEffect = 'move'; } catch(err) {}
              
              clearOverStates();
              if(isBeforeMidpoint(e, target)) target.classList.add('exp-drag-over');
              else target.classList.add('exp-drag-over-bottom');
          });
          
          // ----- DROP -----
          body.addEventListener('drop', (e) => {
              if(!dragEl) return;
              e.preventDefault();
              
              let target = null;
              if(dragKind === 'group') {
                  target = e.target.closest('.exp-group');
                  if(!target || target === dragEl) { clearOverStates(); return; }
                  
                  if(isBeforeMidpoint(e, target)) target.parentNode.insertBefore(dragEl, target);
                  else target.parentNode.insertBefore(dragEl, target.nextSibling);
              } else if(dragKind === 'row') {
                  target = e.target.closest('.exp-section-row');
                  if(!target || target === dragEl) { clearOverStates(); return; }
                  if(target.closest('.exp-group') !== dragSourceGroup) { clearOverStates(); return; }
                  
                  if(isBeforeMidpoint(e, target)) target.parentNode.insertBefore(dragEl, target);
                  else target.parentNode.insertBefore(dragEl, target.nextSibling);
              }
              
              clearOverStates();
              // Sauvegarder le nouvel ordre
              if(Actions.expSaveOrder) Actions.expSaveOrder();
          });
          
          // ----- DRAGEND (cleanup) -----
          body.addEventListener('dragend', () => {
              if(dragEl) dragEl.classList.remove('exp-dragging');
              clearOverStates();
              dragEl = null;
              dragKind = null;
              dragSourceGroup = null;
          });
      },
      
      confirmExportPDF: async () => {
          // Lire les sections cochées
          const selected = [];
          document.querySelectorAll('#export-modal .exp-section-chk:checked').forEach(cb => {
              selected.push(cb.dataset.section);
          });
          
          if(selected.length === 0) {
              Utils.toast('Aucune section sélectionnée', 'warning');
              return;
          }
          
          // Pour chaque section, savoir si la page de garde est activée
          const getCover = (sec) => {
              const el = document.querySelector(`#export-modal .exp-cover-chk[data-section="${sec}"]`);
              return el ? el.checked : false;
          };
          
          // Options spécifiques aux sections
          const opts = {
              synopsis: {
                  includeShort:    ActionsExport._checkState.synopsis.short,
                  includeLong:     ActionsExport._checkState.synopsis.long,
                  includeSynopsis: ActionsExport._checkState.synopsis.main,
                  includeIntent:   ActionsExport._checkState.synopsis.intent,
                  includeDirector: ActionsExport._checkState.synopsis.director,
                  includeProducer: ActionsExport._checkState.synopsis.producer
              },
              script: {
                  sceneNumbers: ActionsExport._checkState.script.numbers,
                  includeNotes: ActionsExport._checkState.script.notes
              },
              chars:  { mode: ActionsExport._modeState.chars },
              actors: { mode: ActionsExport._modeState.actors },
              locs:   { mode: ActionsExport._modeState.locs }
          };
          
          // UI : préparer la barre de progression
          const progressEl     = document.getElementById('exp-progress');
          const progressFillEl = document.getElementById('exp-progress-fill');
          const progressTextEl = document.getElementById('exp-progress-text');
          const confirmBtn     = document.getElementById('exp-confirm-btn');
          progressEl.style.display = 'block';
          confirmBtn.disabled = true;
          confirmBtn.style.opacity = '0.5';
          
          // Mapping section -> label + fonction de génération
          // Helpers pour lire les sous-options
          const storyboardOpts = () => ({
              includeCover: getCover('storyboard'),
              imageOnly:    ActionsExport._sbImageOnly,
              layout:       ActionsExport._sbLayout,
              techLayer:    ActionsExport._sbTechLayer,
              sceneIds:     ActionsExport._sbSceneIds || undefined
          });
          const budgetOpts = () => ({
              includeCover: getCover('budget'),
              simple:       ActionsExport._modeState.budget === 'simple'
          });
          const planningOpts = () => ({
              includeCover:    getCover('planning'),
              includeCallSheet: ActionsExport._checkState.planning.callsheet,
              dayIds:          ActionsExport._planningDayIds || undefined
          });
          // [Séquencier] Épisodes correspondant aux saisons cochées (undefined pour les films
          // → exportSequencerPDF exporte tout sans ouvrir son chooser, seasons.length===0)
          const boardEpisodeIds = () => {
              const seasons = state.data.seasons || [];
              if(state.currentProjectType !== 'series' || seasons.length === 0) return undefined;
              const seaSet = new Set(ActionsExport._boardSeasonIds || seasons.map(s => s.id));
              return (state.data.episodes || []).filter(ep => seaSet.has(ep.seasonId)).map(ep => ep.id);
          };
          const srSceneIds = () => {
              const scope = document.querySelector('input[name="exp-sr-scope"]:checked')?.value || 'all';
              if(scope !== 'select') return null;
              return Array.from(document.querySelectorAll('#export-modal .exp-sr-scene-chk:checked')).map(cb => cb.dataset.sceneId);
          };
          
          // Mapping : chaque section a un build(extra) qui retourne une Promise
          // - extra = { returnBlob: true } en mode fusionné, sinon {}
          const sectionsMap = {
              // titlepage : retiré du Dossier (redondant avec la cover Dossier). Reste accessible en export solo via l'onglet Titre.
              synopsis:     { label: 'Synopsis',              build: (extra) => Synopsis.synopsisToPDF({ includeCover: getCover('synopsis'), ...opts.synopsis, ...extra }) },
              board:        { label: 'Séquencier',            build: (extra) => BeatBoard.exportSequencerPDF({ includeCover: getCover('board'), episodeIds: boardEpisodeIds(), ...extra }) },
              script:       { label: 'Scénario',              build: (extra) => Exporter.scenarioToPDF({ includeCover: getCover('script'), ...opts.script, ...extra }) },
              moodboard:    { label: 'Mood Board',            build: (extra) => MoodBoard.exportPDF({ includeCover: getCover('moodboard'), boardIds: ActionsExport._mbBoardIds || undefined, ...extra }) },
              storyboard:   { label: 'Storyboard',            build: (extra) => Storyboard.exportPDF({ ...storyboardOpts(), ...extra }) },
              presentation: { label: 'Présentation',          build: (extra) => Presentation.exportPDF({ includeCover: getCover('presentation'), ...extra }) },
              chars:        { label: 'Personnages',           build: (extra) => FichesPDF.exportCharacters({ includeCover: getCover('chars'), ...opts.chars, ...extra }) },
              actors:       { label: 'Comédiens',             build: (extra) => FichesPDF.exportActors({ includeCover: getCover('actors'), ...opts.actors, ...extra }) },
              locs:         { label: 'Décors',                build: (extra) => FichesPDF.exportLocations({ includeCover: getCover('locs'), ...opts.locs, ...extra }) },
              breakdown:    { label: 'Dépouillement',         build: (extra) => Breakdown.exportPDF({ includeCover: getCover('breakdown'), ...extra }) },
              crew:         { label: 'Équipe',                build: (extra) => Crew.exportPDF({ includeCover: getCover('crew'), mode: ActionsExport._modeState.crew, ...extra }) },
              orgs:         { label: 'Asso / Entreprises',    build: (extra) => Orgs.exportPDF({ includeCover: getCover('orgs'), mode: ActionsExport._modeState.orgs, ...extra }) },
              resources:    { label: 'Ressources',            build: (extra) => Resources.exportPDF({ includeCover: getCover('resources'), mode: ActionsExport._modeState.resources, ...extra }) },
              planning:     { label: 'Planning',              build: (extra) => Planning.exportPlanningPDF({ ...planningOpts(), ...extra }) },
              workplan:     { label: 'Plan de travail',       build: (extra) => PlanningBoards.exportPDF({ includeCover: getCover('workplan'), tableaux: Object.keys(ActionsExport._checkState.workplan).filter(k => ActionsExport._checkState.workplan[k]), ...extra }) },
              scriptreports: { label: 'Rapports script',     build: (extra) => ScriptReport.exportPDF({ includeCover: getCover('scriptreports'), sceneIds: srSceneIds(), ...extra }) },
              report:       { label: 'Rapport de production', build: (extra) => Exporter.productionReport({ includeCover: getCover('report'), ...extra }) },
              budget:       { label: 'Budget',                build: (extra) => Expenses.exportPDF({ ...budgetOpts(), ...extra }) },
              stats:        { label: 'Statistiques',          build: (extra) => Stats.exportPDF({ includeCover: getCover('stats'), ...extra }) }
          };
          
          // Lire le mode de sortie depuis le toggle "PDF fusionné" (data-active = "1" si actif)
          const isMerged = document.getElementById('exp-toggle-merged')?.dataset.active === '1';
          
          // Génération séquentielle (avec petite pause pour ne pas saturer le navigateur)
          let done = 0;
          const errors = [];
          const collectedBlobs = []; // pour le mode merged
          
          for(const section of selected) {
              const item = sectionsMap[section];
              if(!item) { done++; continue; }
              
              progressTextEl.textContent = `Génération : ${item.label}… (${done + 1}/${selected.length})`;
              progressFillEl.style.width = `${(done / selected.length) * 100}%`;
              
              try {
                  await new Promise(r => setTimeout(r, 60));
                  if(isMerged) {
                      // Mode fusionné : on récupère le blob
                      const blob = await Promise.resolve(item.build({ returnBlob: true }));
                      if(blob) collectedBlobs.push({ label: item.label, blob });
                      else errors.push(item.label + ' (blob vide)');
                  } else {
                      // Mode séparé : téléchargement immédiat
                      await Promise.resolve(item.build({}));
                  }
                  await new Promise(r => setTimeout(r, isMerged ? 60 : 250));
              } catch(e) {
                  console.error(`[Export PDF] Échec ${item.label} :`, e);
                  errors.push(item.label);
              }
              done++;
          }
          
          // Si mode fusionné : assembler le Dossier de Production
          if(isMerged && collectedBlobs.length > 0) {
              progressTextEl.textContent = `Assemblage du Dossier de Production…`;
              progressFillEl.style.width = '95%';
              try {
                  await Exporter.buildDossierProd(collectedBlobs);
              } catch(e) {
                  console.error('[Export PDF] Échec assemblage Dossier Prod :', e);
                  errors.push('Assemblage du dossier');
              }
          }
          
          // Fin
          progressFillEl.style.width = '100%';
          if(errors.length > 0) {
              progressTextEl.textContent = `Terminé avec ${errors.length} erreur(s) : ${errors.join(', ')}`;
              Utils.toast(`Export terminé. ${errors.length} section(s) en erreur : ${errors.join(', ')}`, 'warning');
          } else {
              const msg = isMerged
                  ? `✅ Dossier de Production généré ! (${collectedBlobs.length} sections fusionnées)`
                  : `✅ ${selected.length} PDF généré(s) avec succès !`;
              progressTextEl.textContent = msg;
              Utils.toast(msg.replace('✅ ', ''), 'success');
          }
          
          if(typeof History !== 'undefined' && History.log) {
              History.log('EXPORT', `Export PDF ${isMerged ? 'fusionné' : 'multi-sections'} : ${selected.length} sections, ${errors.length} erreurs`);
          }
          
          // Réactiver le bouton et fermer après 2.2s si tout est OK
          setTimeout(() => {
              confirmBtn.disabled = false;
              confirmBtn.style.opacity = '1';
              if(errors.length === 0) {
                  els.exportModal.style.display = 'none';
                  progressEl.style.display = 'none';
                  progressFillEl.style.width = '0%';
              }
          }, 2200);
      }

  };
  
  // BreakdownExport — sous-module B.4.1 : export PDF du dépouillement (autonome)