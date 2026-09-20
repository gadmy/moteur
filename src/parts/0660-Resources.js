
  const Resources = {
      // ----- ÉTAT + RENDU -----
      currentFilter: 'all',
      
      init: () => {
          Resources.render();
      },
      
      render: () => {
          const container = document.getElementById('resourcesContainer');
          const emptyState = document.getElementById('resourcesEmpty');
          if(!container) return;
          
          const resources = state.data.resources || [];
          const filtered = Resources.currentFilter === 'all' 
              ? resources 
              : resources.filter(r => r.category === Resources.currentFilter);
          
          if(filtered.length === 0) {
              container.innerHTML = '';
              if(emptyState) emptyState.style.display = 'flex';
              return;
          }
          
          if(emptyState) emptyState.style.display = 'none';
          
          // v580 (demande de Guillaume) : MEME SYSTEME DE GROUPES que les
          // autres onglets — sections par groupe (type 'resource'), Non
          // classé, puis le groupe automatique « Sans scène » du chantier 4.
          // Le conteneur perd sa classe grille : ce sont les sections qui
          // portent chacune la leur, comme dans renderDataTab.
          container.className = '';
          const isView = state.currentRole === 'viewer' || (typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('resources'));
          GroupDnD.init();
          const relevantGroups = (state.data.groups || []).filter(g => g.type === 'resource');
          const sans = new Set();
          filtered.forEach(r => { if(FicheLinks.isSansScene('resources', r)) sans.add(r); });
          const cardHtml = (res) => {
              const idx = (state.data.resources || []).indexOf(res);
              const categoryLabels = { accessoire: '🎭 Accessoire', costume: '👔 Costume', vehicule: '🚗 Véhicule' };
              const photo = res.photo ? `<img src="${res.photo}" alt="${Utils.escape(res.name)}">` : '📦';
              const dnd = isView ? '' : ` draggable="true" data-dnd-coll="resources" data-dnd-idx="${idx}"`;
              const actions = state.currentRole === 'viewer' ? '' : `
                  <div class="compact-card-actions">
                      <button class="edit-btn" onclick="event.stopPropagation(); app.Resources.edit('${res.id}')" title="Modifier">✏️</button>
                      <button class="merge-btn" onclick="event.stopPropagation(); app.Resources.merge('${res.id}')" title="Fusionner">🔀</button>
                      <button class="delete-btn" onclick="event.stopPropagation(); app.Resources.delete('${res.id}')" title="Supprimer">🗑️</button>
                      ${CardModal._groupRoundHtml(res, idx, 'resources')}
                      <button class="board-btn" onclick="event.stopPropagation(); app.Board.openSatellites('resource', '${res.id}')" title="Idées / références">💡</button>
                      <button class="web-btn" onclick="event.stopPropagation(); app.Web.open('resource', '${res.id}')" title="Voir dans la toile">🕸️</button>
                  </div>`;
              return `
                  <div class="compact-card" data-category="${res.category}"${dnd} onclick="app.Resources.edit('${res.id}')">
                      ${actions}
                      <div class="compact-card-photo">${photo}</div>
                      <div class="compact-card-name">${Utils.escape(res.name)}</div>
                      <div class="compact-card-role">${Utils.escape(categoryLabels[res.category] || res.category)}</div>
                  </div>`;
          };
          let html = '';
          relevantGroups.forEach(grp => {
              const inGroup = filtered.filter(r => r.group_id === grp.id && !sans.has(r));
              if(inGroup.length > 0 || !isView) {
                  html += `<div class="group-section${inGroup.length ? '' : ' dnd-empty-target'}"><div class="group-header">${Utils.escape(grp.name)}${GroupDnD.delBtnHtml('resources', grp.id, isView)}</div><div class="compact-cards-grid" data-dnd-coll="resources" data-dnd-group="${grp.id}">${inGroup.map(cardHtml).join('')}</div></div>`;
              }
          });
          const noGroup = filtered.filter(r => (!r.group_id || !relevantGroups.find(g => g.id === r.group_id)) && !sans.has(r));
          if(noGroup.length > 0 || relevantGroups.length === 0) {
              html += `<div class="group-section"><div class="group-header text-sec">Non classé</div><div class="compact-cards-grid" data-dnd-coll="resources" data-dnd-group="">${noGroup.map(cardHtml).join('')}</div></div>`;
          }
          if(sans.size > 0) {
              const list = filtered.filter(r => sans.has(r));
              html += `<div class="group-section"><div class="group-header text-sec" title="Ressources n'apparaissant dans aucune scène. Cochez « Classement manuel » dans leur fiche pour les ranger ailleurs.">🚫 Sans scène (${list.length})</div><div class="compact-cards-grid">${list.map(cardHtml).join('')}</div></div>`;
          }
          container.innerHTML = html;
      },
      
      filter: (category) => {
          Resources.currentFilter = category;
          document.querySelectorAll('.res-filter-btn').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.filter === category);
          });
          Resources.render();
      },
      
      getLinkedScenes: (resource) => {
          const scenes = [];
          const searchTerms = [resource.name.toLowerCase(), ...(resource.aliases || []).map(a => a.toLowerCase())];
          
          state.data.scenes.forEach(scene => {
              if(!scene.breakdown) return;
              const categories = ['ACCESSOIRES', 'COSTUMES', 'VEHICULES'];
              categories.forEach(cat => {
                  const items = scene.breakdown[cat] || [];
                  items.forEach(item => {
                      // L'IDENTIFIANT fait foi : renommer la fiche ne rompt plus
                      // le lien. Le nom ne sert que pour les elements pas encore
                      // rattaches (dépouillement anterieur au chantier 7d).
                      const id = Utils.bdId(item);
                      const hit = id ? (id === resource.id)
                                     : searchTerms.includes(Utils.bdText(item).toLowerCase());
                      if(hit) {
                          if(!scenes.find(s => s.id === scene.id)) {
                              scenes.push(scene);
                          }
                      }
                  });
              });
          });
          return scenes;
      },
      
      // Resources.getOwnerText (17 l.) retirée v569, jamais appelée.
      
      // ===================== CRUD (créer / éditer / supprimer) =====================
      add: async () => {
          if(state.currentRole === 'viewer') return;
          
          const modalHtml = Resources.getFormHtml();
          
          const overlay = await UI.showModal({
              title: '➕ Nouvelle Ressource',
              html: modalHtml,
              confirmText: 'Créer',
              onConfirm: () => Resources.saveFromForm()
          });
          if(overlay) requestAnimationFrame(() => { try { FicheBlocks.balance(overlay); } catch(e) {} });
      },
      
      edit: async (id) => {
          // 31 aout — le refus sec « viewer » a saute : c'etait la SEULE famille
          // sur onze ou un simple lecteur ne pouvait meme pas OUVRIR la fiche.
          // Le droit reel est deja porte par roRes ci-dessous (ouverture en
          // lecture, ecriture bloquee), comme partout ailleurs.
          const resource = (state.data.resources || []).find(r => r.id === id);
          if(!resource) return;
          // Une ressource ouverte depuis le depouillement ou la toile reste une
          // fiche de l'onglet Ressources : c'est son droit qui commande.
          const roRes = (typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('resource'))
              || state.currentRole === 'viewer';
          
          const modalHtml = roRes
              ? '<div class="perm-ro-scope is-perm-readonly"><div class="perm-ro-banner">👁 Lecture seule — vous n\'avez pas les droits de modification sur les ressources.</div>'
                + Resources.getFormHtml(resource) + '</div>'
              : Resources.getFormHtml(resource);
          
          const overlay = await UI.showModal({
              title: roRes ? '👁 Ressource (lecture seule)' : '✏️ Modifier la Ressource',
              html: modalHtml,
              confirmText: 'Enregistrer',
              cancelText: roRes ? 'Fermer' : 'Annuler',
              onConfirm: () => { if(roRes) return; Resources.saveFromForm(id); }
          });
          // En lecture seule, un bouton « Enregistrer » qui ne fait rien est un
          // piege : on le retire plutot que de le laisser mentir.
          if(roRes && overlay) { const ok = overlay.querySelector('#um-ok'); if(ok) ok.remove(); }
          if(overlay) requestAnimationFrame(() => { try { FicheBlocks.balance(overlay); } catch(e) {} });
      },
      
      getFormHtml: (resource = null) => {
          const actors = state.data.actors || [];
          const crew = state.data.crew || [];
          
          const ownerType = resource?.owner?.type || 'none';
          const ownerActorId = ownerType === 'actor' ? resource.owner.id : '';
          const ownerCrewId = ownerType === 'crew' ? resource.owner.id : '';
          const ownerManualName = ownerType === 'manual' ? resource.owner.name || '' : '';
          const ownerManualAddress = ownerType === 'manual' ? resource.owner.address || '' : '';
          
          const catEmoji = { accessoire: '🎭', costume: '👔', vehicule: '🚗' };
          const curCat = resource?.category || 'accessoire';
          const avInner = resource?.photo ? `<img src="${Utils.safeMediaUrl(resource.photo)}" alt="">` : (catEmoji[curCat] || '📦');
          const avatarHtml = `<div class="fid-avatar fid-avatar--edit" onclick="document.getElementById('res-photo-input').click()" title="Changer la photo" style="position:relative;">${avInner}<span class="fid-avatar-edit">🖼️</span></div>`;
          const subLabel = (resource && resource.id) ? ('Ressource · fiche n° ' + Utils.escape(String(resource.id))) : 'Ressource · nouvelle fiche';
          const rblocks = [];

          // Brique « Dans le projet » — epinglee a droite.
          let rProj = resource ? UI.renderAppearances('resource', resource.id, '🎬 Utilisé dans', "Utilisé dans aucune scène") : '<div class="appearances-section"><span class="appearances-label" style="font-style:italic;">Enregistrez la fiche pour voir les scènes liées</span></div>';
          if(resource) rProj += UI.renderCost('resource', resource.id);
          rblocks.push(FicheUI.block('resource', 'projet', '🎬 Dans le projet', rProj, { pin: 'right' }));

          // Brique « Fiche » : categorie, photo, proprietaire.
          let rId = FicheUI.field('Catégorie', `<select id="res-category" class="form-input-compact" style="width:100%;">
              <option value="accessoire" ${resource?.category === 'accessoire' ? 'selected' : ''}>🎭 Accessoire</option>
              <option value="costume" ${resource?.category === 'costume' ? 'selected' : ''}>👔 Costume</option>
              <option value="vehicule" ${resource?.category === 'vehicule' ? 'selected' : ''}>🚗 Véhicule</option>
          </select>`);
          rId += FicheUI.field('Photo', `<input type="file" id="res-photo-input" accept="image/*" onchange="app.Resources.previewPhoto(this, '${resource?.id || ''}')" class="mb-10">
              <div id="res-photo-preview" style="width:100%; height:150px; background:var(--panel-bg); border-radius:6px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                  ${resource?.photo ? `<img src="${Utils.safeMediaUrl(resource.photo)}" alt="Photo de la ressource" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span class="text-sec">Aperçu photo</span>'}
              </div>
              <input type="hidden" id="res-photo" value="${Utils.escape(resource?.photo || '')}">`);
          rId += FicheUI.field('Propriétaire', `<select id="res-owner-type" onchange="app.Resources.toggleOwnerFields()" class="n8-input-7" style="width:100%;">
              <option value="none" ${ownerType === 'none' ? 'selected' : ''}>-- Aucun --</option>
              <option value="actor" ${ownerType === 'actor' ? 'selected' : ''}>🎭 Comédien du projet</option>
              <option value="crew" ${ownerType === 'crew' ? 'selected' : ''}>🎬 Technicien du projet</option>
              <option value="manual" ${ownerType === 'manual' ? 'selected' : ''}>✏️ Saisie manuelle (location, etc.)</option>
          </select>
          <div id="res-owner-actor" style="display:${ownerType === 'actor' ? 'block' : 'none'}; margin-top:8px;">
              <select id="res-owner-actor-id" class="form-input-compact" style="width:100%;"><option value="">-- Sélectionner --</option>${actors.map(a => `<option value="${a.id}" ${ownerActorId === a.id ? 'selected' : ''}>${Utils.escape(a.name)}</option>`).join('')}</select>
          </div>
          <div id="res-owner-crew" style="display:${ownerType === 'crew' ? 'block' : 'none'}; margin-top:8px;">
              <select id="res-owner-crew-id" class="form-input-compact" style="width:100%;"><option value="">-- Sélectionner --</option>${crew.map(cm => `<option value="${cm.id}" ${ownerCrewId === cm.id ? 'selected' : ''}>${Utils.escape(cm.name)} (${Utils.escape(cm.role || 'Technicien')})</option>`).join('')}</select>
          </div>
          <div id="res-owner-manual" style="display:${ownerType === 'manual' ? 'block' : 'none'}; margin-top:8px;">
              <div class="fid-field"><span class="fid-label">Nom</span><input type="text" id="res-owner-name" value="${Utils.escape(ownerManualName)}" placeholder="Ex : Studio Location Paris" data-tooltip="Ex : Studio Location Paris" class="n8-input-7" style="width:100%;"></div>
              <div class="fid-field"><span class="fid-label">Adresse</span><input type="text" id="res-owner-address" value="${Utils.escape(ownerManualAddress)}" placeholder="Adresse complète" data-tooltip="Adresse complète" class="form-input-compact" style="width:100%;"></div>
          </div>`);
          rblocks.push(FicheUI.block('resource', 'fiche', '📦 Fiche', rId));

          // Brique « Classement » (groupe + classement manuel).
          if(resource && resource.id) {
              const rIdx = (state.data.resources || []).indexOf(resource);
              let opts = '<option value="">-- Groupe --</option>';
              (state.data.groups || []).filter(g => g.type === 'resource').forEach(g => { opts += `<option value="${g.id}" ${resource.group_id === g.id ? 'selected' : ''}>${Utils.escape(g.name)}</option>`; });
              let rCls = FicheUI.field('Groupe', `<select class="group-select" style="width:100%;" onchange="app.Actions.changeGroup('resources', ${rIdx}, this.value)">${opts}</select>`);
              rCls += FicheLinks.pinToggleHtml('resources', resource, state.currentRole === 'viewer');
              rblocks.push(FicheUI.block('resource', 'classement', '🗂️ Classement', rCls));
          }

          // Brique « Description & note ».
          let rDesc = FicheUI.field('Description', `<textarea id="res-description" rows="3" class="n8-input-10" style="width:100%;" placeholder="Description détaillée..." data-tooltip="Description détaillée...">${Utils.escape(resource?.description || '')}</textarea>`);
          rDesc += FicheUI.field('Note', `<textarea id="res-note" rows="2" class="n8-input-10" style="width:100%;" placeholder="Notes supplémentaires..." data-tooltip="Notes supplémentaires...">${Utils.escape(resource?.note || '')}</textarea>`);
          rblocks.push(FicheUI.block('resource', 'description', '📝 Description & note', rDesc));
          if(resource && resource.id) {
              const roG = Resources._galleryRo();
              const ridxG = (state.data.resources || []).indexOf(resource);
              let rGal = `<div id="res-gallery-grid" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">${Resources._galleryGridHtml(resource, roG)}</div>`;
              if(!roG) rGal += `<input type="file" id="res-gallery-input" accept="image/*" style="display:none;" onchange="app.Resources.addGalleryPhoto(${ridxG}, this)"><button onclick="document.getElementById('res-gallery-input').click()" class="btn btn--primary btn--sm">📤 Ajouter une photo</button>`;
              rblocks.push(FicheUI.block('resource', 'galerie', '📸 Photos', rGal));
          }
          if(resource && resource.id) rblocks.push(FicheUI.block('resource', 'ideas', '💡 Idées', Board.render('resource', resource.id, ((typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('resource')) || state.currentRole === 'viewer'))));

          return `<div class="data-card fid-card" style="max-width:none; margin:0; box-shadow:none; border:none; padding:0;">
              <div class="fid-head" style="padding:0 0 14px;">
                  ${avatarHtml}
                  <div class="fid-head-main">
                      <input type="text" id="res-name" class="fid-name" value="${resource ? Utils.escape(resource.name) : ''}" placeholder="Ex : Robe rouge, Téléphone vintage..." data-tooltip="Ex : Robe rouge, Téléphone vintage...">
                      <div class="fid-sub">${subLabel}</div>
                  </div>
              </div>
              ${FicheBlocks.renderTabbed(rblocks, 'resource')}
          </div>
          `;
      },
      
      toggleOwnerFields: () => {
          const type = document.getElementById('res-owner-type').value;
          document.getElementById('res-owner-actor').style.display = type === 'actor' ? 'block' : 'none';
          document.getElementById('res-owner-crew').style.display = type === 'crew' ? 'block' : 'none';
          document.getElementById('res-owner-manual').style.display = type === 'manual' ? 'block' : 'none';
      },
      
      // 1er septembre — L'IDENTIFIANT DE LA FICHE ARRIVE MAINTENANT EN
      // PARAMETRE. La fonction lisait un champ #res-edit-id qui n'existe dans
      // aucun formulaire : le repli 'res_new_<horloge>' s'appliquait donc
      // TOUJOURS, et chaque photo de ressource partait au stockage sous un nom
      // sans rapport avec sa fiche — un nom different a chaque envoi, meme
      // pour la meme ressource. La photo s'affichait quand meme (c'est l'URL
      // qui est enregistree sur la fiche), d'ou l'invisibilite du defaut ; mais
      // plus rien ne reliait le fichier a son objet. Le repli est conserve pour
      // une ressource qu'on est en train de creer, qui n'a pas encore d'id.
      previewPhoto: async (input, resourceId) => {
          const preview = document.getElementById('res-photo-preview');
          const hiddenInput = document.getElementById('res-photo');
          
          if(input.files && input.files[0]) {
              const file = input.files[0];
              input.value = ''; // reset (avant async)
              Utils.toast('Envoi de la photo...', 'info', 1500);
              // Upload direct vers Storage (au lieu de base64 dans state.data)
              const editingId = resourceId || ('res_new_' + Date.now());
              const url = await Utils.uploadProjectFile(file, {
                  category: 'resources',
                  entityId: editingId,
                  kind: 'photo',
                  maxDimension: 1280, quality: 0.85, maxKb: 400
              });
              if(!url) return;
              preview.innerHTML = `<img src="${url}" alt="Aperçu de la photo" style="max-width:100%; max-height:100%; object-fit:contain;">`;
              hiddenInput.value = url;
          }
      },

      // ----- Galerie photo de la ressource (comme decors/comediens) -----
      _galleryRo: () => (typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('resource')) || state.currentRole === 'viewer',
      _galleryGridHtml: (resource, ro) => {
          const photos = resource.galleryPhotos || [];
          const fav = resource.galleryFav || [];
          const ridx = (state.data.resources || []).indexOf(resource);
          if(!photos.length) return '<span style="color:var(--text-sec); font-size:0.85rem; font-style:italic;">Aucune photo</span>';
          return photos.map((url, pIdx) => `<div style="position:relative; width:80px; height:80px;"><img src="${Utils.safeMediaUrl(url)}" alt="Photo" class="${fav.includes(url) ? 'gallery-thumb-fav' : ''}" style="width:100%; height:100%; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:pointer;" onclick="app.PhotoViewer.open('resources', ${ridx}, ${pIdx})">${fav.includes(url) ? '<span class="gallery-fav-badge">❤</span>' : ''}${!ro ? `<button onclick="app.Resources.removeGalleryPhoto(${ridx}, ${pIdx})" style="position:absolute; top:-5px; right:-5px; background:var(--danger); color:white; border:none; border-radius:50%; width:18px; height:18px; cursor:pointer; font-size:10px;">✕</button>` : ''}</div>`).join('');
      },
      _refreshGalleryGrid: (idx) => {
          const res = (state.data.resources || [])[idx];
          const grid = document.getElementById('res-gallery-grid');
          if(res && grid) grid.innerHTML = Resources._galleryGridHtml(res, Resources._galleryRo());
      },
      addGalleryPhoto: async (idx, input) => {
          if(Resources._galleryRo()) return;
          const res = (state.data.resources || [])[idx];
          if(!res || !input || !input.files || !input.files[0]) return;
          const file = input.files[0]; input.value = '';
          Utils.toast('Envoi de la photo...', 'info', 1500);
          const url = await Utils.uploadProjectFile(file, { category: 'resources', entityId: res.id || 'x', kind: 'gallery', maxDimension: 1920, quality: 0.9, maxKb: 1500 });
          if(!url) return;
          if(!Array.isArray(res.galleryPhotos)) res.galleryPhotos = [];
          res.galleryPhotos.push(url);
          Store.save();
          Resources._refreshGalleryGrid(idx);
      },
      removeGalleryPhoto: (idx, photoIdx) => {
          if(Resources._galleryRo()) return;
          const res = (state.data.resources || [])[idx];
          if(!res || !Array.isArray(res.galleryPhotos)) return;
          res.galleryPhotos.splice(photoIdx, 1);
          Store.save();
          Resources._refreshGalleryGrid(idx);
      },
      
      saveFromForm: (editId = null) => {
          // Garde d'ecriture : la fiche peut avoir ete ouverte depuis un autre
          // onglet, ou l'utilisateur n'a pas le droit de modifier les ressources.
          if(!Permissions.canEditFiche('resource')) { Utils.toast("Vous n'avez pas les droits de modification sur les ressources.", 'error'); return; }
          const name = document.getElementById('res-name').value.trim();
          const category = document.getElementById('res-category').value;
          const photo = document.getElementById('res-photo').value;
          const description = document.getElementById('res-description').value.trim();
          const note = document.getElementById('res-note').value.trim();
          
          if(!name) {
              Utils.toast('Le nom est obligatoire', 'error');
              return false;
          }
          
          // Owner
          let owner = null;
          const ownerType = document.getElementById('res-owner-type').value;
          if(ownerType === 'actor') {
              const id = document.getElementById('res-owner-actor-id').value;
              if(id) owner = { type: 'actor', id };
          } else if(ownerType === 'crew') {
              const id = document.getElementById('res-owner-crew-id').value;
              if(id) owner = { type: 'crew', id };
          } else if(ownerType === 'manual') {
              const manualName = document.getElementById('res-owner-name').value.trim();
              const manualAddress = document.getElementById('res-owner-address').value.trim();
              if(manualName) owner = { type: 'manual', name: manualName, address: manualAddress };
          }
          
          if(!state.data.resources) state.data.resources = [];
          
          const categoryLabels = { accessoire: 'accessoire', costume: 'costume', vehicule: 'véhicule' };
          const catLabel = categoryLabels[category] || category;
          if(editId) {
              const idx = state.data.resources.findIndex(r => r.id === editId);
              let oldName = null;
              if(idx > -1) {
                  oldName = state.data.resources[idx].name;
                  state.data.resources[idx] = { ...state.data.resources[idx], name, category, photo, description, note, owner };
              }
              Utils.toast('Ressource modifiée', 'success');
              History.log('EDIT', `Modification ${catLabel} : ${name}`, { target: { kind: 'resource', id: editId, label: name }, link: { kind: 'resource', id: editId } });
              // v594 : le nom d'une ressource est aussi mis en cache dans les
              // etiquettes du depouillement (meme principe que personnages/
              // decors) — sans ca, la colonne de droite et le trait jaune
              // restent bloques sur l'ancien nom apres un renommage.
              if(oldName && oldName !== name) {
                  (state.data.scenes || []).forEach(s => {
                      if(!s || !s.breakdown) return;
                      Object.values(s.breakdown).forEach(arr => {
                          (arr || []).forEach(it => { if(it && typeof it === 'object' && it.id === editId) it.t = name; });
                      });
                  });
                  if(typeof RenameReview !== 'undefined') RenameReview.check(oldName, name);
                  try {
                      const activeTab = document.querySelector('.tab-content.active');
                      if(activeTab && activeTab.id === 'tab-breakdown' && typeof Breakdown !== 'undefined' && Breakdown.init) Breakdown.init();
                  } catch(e) {}
              }
          } else {
              const newResource = {
                  id: 'res_' + Utils.generateUniqueId(),
                  name,
                  category,
                  photo,
                  description,
                  note,
                  owner,
                  aliases: []
              };
              state.data.resources.push(newResource);
              Utils.toast('Ressource créée', 'success');
              History.log('ADD', `Ajout ${catLabel} : ${name}`, { target: { kind: 'resource', id: newResource.id, label: name }, link: { kind: 'resource', id: newResource.id } });
          }
          
          Store.save();
          Resources.render();
          return true;
      },
      
      delete: async (id) => {
          if(state.currentRole === 'viewer') return;
          
          const resource = (state.data.resources || []).find(r => r.id === id);
          if(!resource) return;
          
          // Vérifier si la ressource est utilisée dans le dépouillement
          const bdCategory = RESOURCE_CAT_TO_BD[resource.category];
          const searchTerms = [resource.name.toLowerCase(), ...(resource.aliases || []).map(a => a.toLowerCase())];
          
          let usedInScenes = [];
          state.data.scenes.forEach(scene => {
              if(!scene.breakdown || !scene.breakdown[bdCategory]) return;
              scene.breakdown[bdCategory].forEach(item => {
                  const id = Utils.bdId(item);
                  const hit = id ? (id === resource.id) : searchTerms.includes(Utils.bdText(item).toLowerCase());
                  if(hit) {
                      if(!usedInScenes.find(s => s.id === scene.id)) {
                          usedInScenes.push(scene);
                      }
                  }
              });
          });
          
          let message = `Êtes-vous sûr de vouloir supprimer "${resource.name}" ?`;
          let deleteFromBreakdown = false;
          
          if(usedInScenes.length > 0) {
              const alsoDelete = await ConfirmModal.show({
                  title: '🗑️ Supprimer la ressource',
                  message: `"${Utils.escape(resource.name)}" est utilisée dans ${usedInScenes.length} scène(s). Voulez-vous aussi la supprimer du dépouillement ?`,
                  icon: '🗑️',
                  dangerous: true,
                  confirmText: 'Supprimer partout',
                  cancelText: 'Fiche uniquement'
              });
              deleteFromBreakdown = alsoDelete;
          } else {
              const confirmed = await ConfirmModal.show({
                  title: '🗑️ Supprimer la ressource',
                  message: message,
                  icon: '🗑️',
                  dangerous: true,
                  confirmText: 'Supprimer'
              });
              if(!confirmed) return;
          }
          
          // Supprimer du dépouillement si demandé
          if(deleteFromBreakdown) {
              state.data.scenes.forEach(scene => {
                  if(!scene.breakdown || !scene.breakdown[bdCategory]) return;
                  scene.breakdown[bdCategory] = scene.breakdown[bdCategory].filter(item => {
                      const id = Utils.bdId(item);
                      return id ? (id !== resource.id) : !searchTerms.includes(Utils.bdText(item).toLowerCase());
                  });
              });
          }
          
          // [Phase D] Capturer le recoverable AVANT suppression
          // On ne supprime PAS la photo Storage : elle reste référencée dans le journal
          const resourceLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          const resourceRecoverable = await History.captureRecoverable(resource, 'resource', resourceLogId);
          
          state.data.resources = state.data.resources.filter(r => r.id !== id);
          const categoryLabels = { accessoire: 'accessoire', costume: 'costume', vehicule: 'véhicule' };
          const catLabel = categoryLabels[resource.category] || resource.category;
          History.log('DELETE', `Suppression ${catLabel} : ${resource.name}${deleteFromBreakdown ? ' (et du dépouillement)' : ''}`, {
              target: { kind: 'resource', id: resource.id, label: resource.name },
              recoverable: resourceRecoverable,
              details: { deleteFromBreakdown: !!deleteFromBreakdown }
          });
          Store.save();
          Resources.render();
          Utils.toast('Ressource supprimée', 'success');
      },
      
      // ===================== RELATIONS (lier scènes / fusionner) =====================
      // Resources.link (49 l.) retirée v569, jamais appelée depuis aucun bouton.
      // Embryon de liaison Ressources <-> Dépouillement : voir étape 7d du plan.
      
      merge: async (id) => {
          const resource = (state.data.resources || []).find(r => r.id === id);
          if(!resource) return;
          
          // Trouver les autres ressources de la même catégorie
          const others = state.data.resources.filter(r => r.id !== id && r.category === resource.category);
          
          if(others.length === 0) {
              Utils.toast('Aucune autre ressource de cette catégorie à fusionner', 'info');
              return;
          }
          
          // Mini-fiches cliquables (multi-sélection)
          const ficheCards = others.map(r => {
              const scenes = Resources.getLinkedScenes(r);
              const desc = r.description ? Utils.escape(r.description.substring(0, 60)) + (r.description.length > 60 ? '…' : '') : '';
              return `
                  <div class="merge-fiche" data-target-id="${r.id}">
                      <div class="merge-fiche-name">${Utils.escape(r.name)}</div>
                      ${desc ? `<div class="merge-fiche-desc">${desc}</div>` : ''}
                      <div class="merge-fiche-meta">
                          ${scenes.length > 0 ? `<span>📍 ${scenes.length} scène${scenes.length > 1 ? 's' : ''}</span>` : ''}
                          ${r.photo ? '<span style="color:var(--success);">📷 Photo</span>' : ''}
                      </div>
                  </div>
              `;
          }).join('');
          
          const myScenes = Resources.getLinkedScenes(resource);
          const categoryLabels = { accessoire: 'Accessoire', costume: 'Costume', vehicule: 'Véhicule' };
          const categoryLabel = categoryLabels[resource.category] || resource.category;
          
          await UI.showModal({
              title: `🔀 Fusionner "${resource.name}"`,
              html: `
                  <style>
                      .merge-source-box { margin-bottom: 14px; padding: 12px; background: var(--bg); border-radius: 8px; border-left: 3px solid var(--primary); }
                      .merge-source-box .src-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-sec); margin-bottom: 4px; }
                      .merge-source-box .src-name { font-weight: 600; font-size: 1rem; }
                      .merge-source-box .src-meta { font-size: 0.8rem; color: var(--text-sec); margin-top: 4px; }
                      .merge-instructions { font-size: 0.85rem; color: var(--text-sec); margin-bottom: 12px; line-height: 1.4; }
                      .merge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); max-height: 360px; overflow-y: auto; }
                      .merge-fiche { padding: 10px 12px; background: var(--panel-bg); border: 2px solid var(--border); border-radius: 6px; cursor: pointer; transition: all 0.15s; user-select: none; }
                      .merge-fiche:hover { border-color: var(--primary); transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
                      .merge-fiche.selected { border-color: var(--primary); background: rgba(43,110,246,0.08); }
                      .merge-fiche.selected .merge-fiche-name::before { content: '✓ '; color: var(--primary); font-weight: bold; }
                      .merge-fiche-name { font-weight: 600; font-size: 0.9rem; line-height: 1.3; word-break: break-word; }
                      .merge-fiche-desc { font-size: 0.78rem; color: var(--text-sec); margin-top: 4px; line-height: 1.3; }
                      .merge-fiche-meta { font-size: 0.75rem; color: var(--text-sec); margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; }
                      .merge-counter { margin-top: 10px; font-size: 0.85rem; color: var(--text-sec); }
                      .merge-counter strong { color: var(--primary); }
                  </style>
                  <div class="merge-source-box">
                      <div class="src-label">Fiche source (${Utils.escape(categoryLabel)})</div>
                      <div class="src-name">${Utils.escape(resource.name)}</div>
                      ${myScenes.length > 0 ? `<div class="src-meta">📍 ${myScenes.length} scène${myScenes.length > 1 ? 's' : ''} liée${myScenes.length > 1 ? 's' : ''}</div>` : ''}
                  </div>
                  <div class="merge-instructions">Cliquez sur une ou plusieurs fiches à fusionner avec la fiche source. La fiche la plus complète sera conservée comme fiche maître ; les autres deviendront des alias et leurs occurrences dans le dépouillement seront renommées automatiquement.</div>
                  <div class="merge-grid">${ficheCards}</div>
                  <div class="merge-counter" id="merge-counter">Aucune fiche sélectionnée</div>
              `,
              confirmText: 'Fusionner',
              type: 'warning',
              onConfirm: async () => {
                  const selectedCards = document.querySelectorAll('.merge-fiche.selected');
                  if(selectedCards.length === 0) {
                      Utils.toast('Sélectionnez au moins une fiche à fusionner', 'error');
                      return false;
                  }
                  
                  const targetIds = Array.from(selectedCards).map(c => c.dataset.targetId);
                  const targets = targetIds.map(tid => state.data.resources.find(r => r.id === tid)).filter(Boolean);
                  if(targets.length === 0) return false;
                  
                  // Score : plus le score est haut, plus la fiche est complète
                  const scoreResource = (r) => {
                      let score = 0;
                      if(r.photo) score += 10;
                      if(r.description) score += 5;
                      if(r.owner) score += 3;
                      if(r.note) score += 2;
                      if(!r.autoCreated) score += 5;
                      return score;
                  };
                  
                  // Choisir la fiche maître parmi source + cibles
                  const allCandidates = [resource, ...targets];
                  const keepResource = allCandidates.reduce((best, cur) => scoreResource(cur) > scoreResource(best) ? cur : best, allCandidates[0]);
                  const removeResources = allCandidates.filter(r => r.id !== keepResource.id);
                  
                  // === DOUBLE CONFIRMATION (action destructive et irréversible) ===
                  const removedNames = removeResources.map(rr => `• ${rr.name}`).join('\n');
                  const totalScenesAffected = removeResources.reduce((sum, rr) => sum + Resources.getLinkedScenes(rr).length, 0);
                  const confirmMsg = `⚠️ Action IRRÉVERSIBLE\n\n` +
                      `Fiche maître conservée :\n✓ ${keepResource.name}\n\n` +
                      `Fiche${removeResources.length > 1 ? 's' : ''} qui ${removeResources.length > 1 ? 'seront supprimées' : 'sera supprimée'} (${removeResources.length}) :\n${removedNames}\n\n` +
                      (totalScenesAffected > 0 ? `📍 ${totalScenesAffected} occurrence${totalScenesAffected > 1 ? 's' : ''} dans le dépouillement ${totalScenesAffected > 1 ? 'seront renommées' : 'sera renommée'} en "${keepResource.name}"\n\n` : '') +
                      `Confirmer la fusion ?`;
                  const confirmed = await ConfirmModal.show({
                      title: 'Confirmer la fusion',
                      message: confirmMsg,
                      icon: '🔀',
                      dangerous: true,
                      confirmText: `Fusionner ${removeResources.length + 1} → 1`
                  });
                  if(!confirmed) return false;
                  // === FIN DOUBLE CONFIRMATION ===
                  
                  // Fusionner les aliases (noms alternatifs) de toutes les fiches à supprimer
                  const allAliases = new Set(keepResource.aliases || []);
                  removeResources.forEach(rr => {
                      (rr.aliases || []).forEach(a => allAliases.add(a));
                      allAliases.add(rr.name);
                  });
                  allAliases.delete(keepResource.name);
                  keepResource.aliases = Array.from(allAliases);
                  
                  // Mettre à jour le dépouillement pour renommer les occurrences de chaque fiche supprimée
                  const bdCategory = RESOURCE_CAT_TO_BD[keepResource.category];
                  const removedNamesLower = removeResources.map(rr => rr.name.toLowerCase());
                  const removedIds = new Set(removeResources.map(rr => rr.id));
                  
                  state.data.scenes.forEach(scene => {
                      if(!scene.breakdown || !scene.breakdown[bdCategory]) return;
                      scene.breakdown[bdCategory] = scene.breakdown[bdCategory].map(item => {
                          const id = Utils.bdId(item);
                          const hit = id ? removedIds.has(id) : removedNamesLower.includes(Utils.bdText(item).toLowerCase());
                          // Fusionner, c'est faire pointer les occurrences des
                          // fiches supprimees vers celle qu'on garde — texte ET
                          // identifiant, sinon l'occurrence resterait orpheline
                          // d'une fiche qui n'existe plus.
                          return hit ? Utils.bdItem(keepResource.name, bdCategory, keepResource.id) : item;
                      });
                      // Supprimer les doublons (par identifiant, ou par texte pour
                      // les elements pas encore rattaches).
                      const seen = new Set();
                      scene.breakdown[bdCategory] = scene.breakdown[bdCategory].filter(item => {
                          const key = Utils.bdId(item) || ('t:' + Utils.bdText(item).toLowerCase());
                          if(seen.has(key)) return false;
                          seen.add(key);
                          return true;
                      });
                  });
                  
                  // Supprimer les fiches fusionnées
                  const removeIds = new Set(removeResources.map(rr => rr.id));
                  state.data.resources = state.data.resources.filter(r => !removeIds.has(r.id));
                  
                  Store.save();
                  Resources.render();
                  const count = removeResources.length;
                  const removedNamesForLog = removeResources.map(rr => rr.name).join(', ');
                  History.log('MERGE', `Fusion de ${count + 1} fiches → "${keepResource.name}" (fusionnées : ${removedNamesForLog})`);
                  Utils.toast(`${count + 1} fiches fusionnées en "${keepResource.name}"`, 'success');
                  return true;
              }
          });
          
          // Activer la sélection multi : binding cliquable sur chaque mini-fiche
          // (setTimeout 0 pour s'exécuter après que showModal a injecté le HTML dans le DOM)
          setTimeout(() => {
              const cards = document.querySelectorAll('.merge-fiche');
              const counter = document.getElementById('merge-counter');
              const okBtn = document.getElementById('um-ok');
              const updateCounter = () => {
                  const n = document.querySelectorAll('.merge-fiche.selected').length;
                  if(counter) {
                      counter.innerHTML = n === 0
                          ? 'Aucune fiche sélectionnée'
                          : `<strong>${n}</strong> fiche${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''} → fusion en 1 seule fiche maître`;
                  }
                  if(okBtn) okBtn.textContent = n > 0 ? `Fusionner (${n + 1} → 1)` : 'Fusionner';
              };
              cards.forEach(card => {
                  card.addEventListener('click', () => {
                      card.classList.toggle('selected');
                      updateCounter();
                  });
              });
              updateCounter();
          }, 0);
      },
      
      // ===================== EXPORT PDF =====================
      // [Phase C.5.2 → refonte multi-modes Phase D] Export PDF des ressources
      // 3 modes : detailed (par cat, fiche compacte) | list (tableau dense) | card (1 page/ressource)
      openExportModal: () => {
          const resources = state.data.resources || [];
          if(resources.length === 0) {
              Utils.toast('Aucune ressource à exporter', 'warning');
              return;
          }
          Actions.openExportModal('resources');
          document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
              cb.checked = (cb.dataset.section === 'resources');
          });
      },
      
      exportPDF: async (opts = {}) => {
          await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
          opts.mode = opts.mode || 'detailed';
          const isCard = opts.mode === 'card';
          const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const margin = 20;
          const usableWidth = pageWidth - margin * 2;
          
          const resources = state.data.resources || [];
          if(resources.length === 0) {
              Utils.toast('Aucune ressource à exporter', 'warning');
              return;
          }
          
          const catLabels = { accessoire: 'Accessoires', costume: 'Costumes', vehicule: 'Véhicules', autre: 'Autres' };
          const CAT_TO_BD = { accessoire: 'ACCESSOIRES', costume: 'COSTUMES', vehicule: 'VEHICULES' };
          
          if(opts.mode !== 'list') Utils.toast('Préparation des photos...', 'info');
          let photoMap = {};
          if(opts.mode !== 'list' && typeof FichesPDF !== 'undefined' && FichesPDF._preloadImages) {
              const urls = resources.map(r => r.photo).filter(Boolean);
              photoMap = await FichesPDF._preloadImages(urls);
          }
          
          const scenesUsing = (resource) => {
              const bdCat = CAT_TO_BD[resource.category];
              if(!bdCat) return [];
              const terms = [resource.name.toLowerCase(), ...(resource.aliases || []).map(a => a.toLowerCase())];
              const found = [];
              (state.data.scenes || []).forEach((scene, idx) => {
                  if(!scene.breakdown || !scene.breakdown[bdCat]) return;
                  if(scene.breakdown[bdCat].some(item => {
                      const id = Utils.bdId(item);
                      return id ? (id === resource.id) : terms.includes(Utils.bdText(item).toLowerCase());
                  })) {
                      found.push({ scene, idx });
                  }
              });
              return found;
          };
          
          const isSeries = state.currentProjectType === 'series';
          const sceneLabel = (scene, idx) => {
              if(isSeries && scene.episodeId) {
                  const ep = (state.data.episodes || []).find(e => e.id === scene.episodeId);
                  if(ep && typeof UI !== 'undefined' && UI.formatSceneNumber) {
                      const scenesInEp = (state.data.scenes || []).filter(x => x.episodeId === ep.id);
                      return UI.formatSceneNumber(scene, scenesInEp.indexOf(scene));
                  }
              }
              return '#' + (idx + 1);
          };
          
          if(opts.includeCover !== false) {
              if(typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) {
                  FichesPDF._drawCoverPage(doc, 'Ressources');
              } else {
                  PdfTheme.coverPage(doc, { sectionName: 'Ressources' });
              }
              doc.addPage();
          }
          let y = margin;
          
          const byCat = {};
          resources.forEach(r => {
              const c = r.category || 'autre';
              if(!byCat[c]) byCat[c] = [];
              byCat[c].push(r);
          });
          const catOrder = ['accessoire', 'costume', 'vehicule', 'autre'].filter(c => byCat[c]);
          
          const ensureSpace = (space) => {
              if(y + space > pageHeight - margin - 5) { doc.addPage(); y = margin; }
          };
          
          const drawCatHeader = (catKey, count) => {
              ensureSpace(14);
              const lbl = (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText(catLabels[catKey] || catKey) : (catLabels[catKey] || catKey);
              y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                              title: lbl, right: String(count),
                                              accent: PdfTheme.accentFor('Ressources') });
          };
          
          const drawPhoto = (url, x, y, w, h) => {
              if(typeof FichesPDF !== 'undefined' && FichesPDF._drawPhotoOrPlaceholder) {
                  FichesPDF._drawPhotoOrPlaceholder(doc, url, x, y, w, h);
              } else {
                  doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
                  doc.rect(x, y, w, h, 'F');
                  if(url) { try { doc.addImage(url, 'JPEG', x, y, w, h); } catch(e){} }
              }
          };
          
          const cleanT = (t) => (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');
          
          // ===== MODE DETAILED =====
          const renderDetailed = (r) => {
              const cardH = 38;
              ensureSpace(cardH);
              const photoW = 32, photoH = 32;
              const photoUrl = r.photo ? photoMap[r.photo] : null;
              drawPhoto(photoUrl, margin, y, photoW, photoH);
              const textX = margin + photoW + 5;
              const textWidth = usableWidth - photoW - 7;
              let ty = y + 5;
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(11);
              doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
              doc.text(cleanT(r.name) || '(sans nom)', textX, ty);
              ty += 4.5;
              if(r.description) {
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                  const dLines = doc.splitTextToSize(cleanT(r.description), textWidth);
                  dLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
              }
              if(r.owner) {
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(8.5);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                  doc.text('Propriétaire : ' + cleanT(r.owner), textX, ty);
                  ty += 3.6;
              }
              if(r.note) {
                  doc.setFont('helvetica', 'italic');
                  doc.setFontSize(8);
                  doc.setTextColor(...PdfTheme.COLORS.WARNING);
                  const nLines = doc.splitTextToSize('Note : ' + cleanT(r.note), textWidth);
                  nLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
              }
              const used = scenesUsing(r);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              if(used.length > 0) {
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                  const labels = used.map(u => sceneLabel(u.scene, u.idx)).join('  ');
                  const sLines = doc.splitTextToSize(`Utilisée dans (${used.length}) : ${labels}`, textWidth);
                  sLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
              } else {
                  doc.setFont('helvetica', 'italic');
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                  doc.text('Non assignée à une scène', textX, ty);
                  ty += 3.5;
              }
              const actualH = Math.max(photoH + 4, ty - y + 2);
              doc.setDrawColor(...PdfTheme.COLORS.BORDER);
              doc.setLineWidth(0.2);
              doc.rect(margin - 2, y - 2, usableWidth + 4, actualH);
              y += actualH + 3;
          };
          
          // ===== MODE LIST =====
          const renderList = (catResources) => {
              const lineH = 5.5;
              ensureSpace(lineH);
              doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
              doc.rect(margin, y, usableWidth, lineH, 'F');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(8);
              doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
              const colsW = [usableWidth * 0.22, usableWidth * 0.40, usableWidth * 0.18, usableWidth * 0.10, usableWidth * 0.10];
              const colsX = [margin];
              for(let i = 1; i < colsW.length; i++) colsX.push(colsX[i-1] + colsW[i-1]);
              doc.text('Nom',           colsX[0] + 1, y + 3.8);
              doc.text('Description',   colsX[1] + 1, y + 3.8);
              doc.text('Propriétaire',  colsX[2] + 1, y + 3.8);
              doc.text('Note',          colsX[3] + 1, y + 3.8);
              doc.text('Scènes',        colsX[4] + colsW[4] - 1, y + 3.8, { align: 'right' });
              y += lineH + 1;
              catResources.forEach(r => {
                  ensureSpace(lineH);
                  const used = scenesUsing(r);
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(8.5);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                  let txtName = cleanT(r.name) || '(sans nom)';
                  while(doc.getTextWidth(txtName) > colsW[0] - 2 && txtName.length > 4) txtName = txtName.substring(0, txtName.length - 2) + '…';
                  doc.text(txtName, colsX[0] + 1, y + 3.8);
                  doc.setFont('helvetica', 'normal');
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                  let txtDesc = cleanT(r.description) || '—';
                  while(doc.getTextWidth(txtDesc) > colsW[1] - 2 && txtDesc.length > 4) txtDesc = txtDesc.substring(0, txtDesc.length - 2) + '…';
                  doc.text(txtDesc, colsX[1] + 1, y + 3.8);
                  let txtOwn = cleanT(r.owner) || '—';
                  while(doc.getTextWidth(txtOwn) > colsW[2] - 2 && txtOwn.length > 4) txtOwn = txtOwn.substring(0, txtOwn.length - 2) + '…';
                  doc.text(txtOwn, colsX[2] + 1, y + 3.8);
                  doc.setFont('helvetica', 'italic');
                  doc.setTextColor(...PdfTheme.COLORS.WARNING);
                  let txtNote = r.note ? cleanT(r.note) : '—';
                  while(doc.getTextWidth(txtNote) > colsW[3] - 2 && txtNote.length > 4) txtNote = txtNote.substring(0, txtNote.length - 2) + '…';
                  doc.text(txtNote, colsX[3] + 1, y + 3.8);
                  doc.setFont('helvetica', 'normal');
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                  doc.text(`${used.length} sc.`, colsX[4] + colsW[4] - 1, y + 3.8, { align: 'right' });
                  doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                  doc.setLineWidth(0.1);
                  doc.setLineDashPattern([0.5, 0.5], 0);
                  doc.line(margin, y + lineH, margin + usableWidth, y + lineH);
                  doc.setLineDashPattern([], 0);
                  y += lineH;
              });
              y += 2;
          };
          
          // ===== MODE CARD (A4 paysage) =====
          const renderCard = (r) => {
              const photoUrl = r.photo ? photoMap[r.photo] : null;
              doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
              doc.rect(0, 0, pageWidth, 18, 'F');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(14);
              doc.setTextColor(...PdfTheme.COLORS.WHITE);
              const catLbl = (catLabels[r.category] || r.category || '—').toUpperCase();
              doc.text(PdfTheme.cleanText(catLbl), margin, 11);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.text(PdfTheme.cleanText(state.data.title || ''), pageWidth - margin, 11, { align: 'right' });
              const photoW2 = 95, photoH2 = 85;
              const photoX = margin, photoY = 28;
              drawPhoto(photoUrl, photoX, photoY, photoW2, photoH2);
              const infoX = photoX + photoW2 + 12;
              const infoW = pageWidth - infoX - margin;
              let iy = photoY + 6;
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(20);
              doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
              const nLines = doc.splitTextToSize(cleanT(r.name) || '(sans nom)', infoW);
              nLines.forEach(l => { doc.text(l, infoX, iy); iy += 7.5; });
              iy += 3;
              if(r.description) {
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                  doc.text('DESCRIPTION', infoX, iy);
                  iy += 4;
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(10);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                  const dLines = doc.splitTextToSize(cleanT(r.description), infoW);
                  dLines.forEach(l => { if(iy < pageHeight - 50) { doc.text(l, infoX, iy); iy += 4.5; } });
                  iy += 3;
              }
              if(r.owner) {
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                  doc.text('PROPRIÉTAIRE', infoX, iy);
                  iy += 4;
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(10);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                  doc.text(cleanT(r.owner), infoX, iy);
                  iy += 6;
              }
              if(r.note) {
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                  doc.text('NOTE', infoX, iy);
                  iy += 4;
                  doc.setFont('helvetica', 'italic');
                  doc.setFontSize(9.5);
                  doc.setTextColor(...PdfTheme.COLORS.WARNING);
                  const nLines2 = doc.splitTextToSize(cleanT(r.note), infoW);
                  nLines2.forEach(l => { if(iy < pageHeight - 50) { doc.text(l, infoX, iy); iy += 4.2; } });
                  iy += 3;
              }
              if(r.aliases && r.aliases.length > 0) {
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                  doc.text('ALIAS', infoX, iy);
                  iy += 4;
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                  doc.text(r.aliases.join(', '), infoX, iy);
                  iy += 5;
              }
              const used = scenesUsing(r);
              const bottomY = pageHeight - 30;
              doc.setLineWidth(0.3);
              doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
              doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(10);
              doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
              doc.text(`UTILISÉE DANS (${used.length})`, margin, bottomY);
              if(used.length > 0) {
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                  const labels = used.map(u => sceneLabel(u.scene, u.idx)).join('  ·  ');
                  const sLines = doc.splitTextToSize(labels, pageWidth - margin * 2);
                  let sy = bottomY + 5;
                  sLines.slice(0, 3).forEach(l => { doc.text(l, margin, sy); sy += 4; });
              } else {
                  doc.setFont('helvetica', 'italic');
                  doc.setFontSize(9);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                  doc.text('Non assignée à une scène', margin, bottomY + 5);
              }
          };
          
          // ===== EXÉCUTION =====
          if(opts.mode === 'card') {
              resources.forEach((r, idx) => {
                  if(idx > 0) doc.addPage();
                  renderCard(r);
              });
          } else {
              catOrder.forEach(catKey => {
                  drawCatHeader(catKey, byCat[catKey].length);
                  if(opts.mode === 'list') renderList(byCat[catKey]);
                  else byCat[catKey].forEach(r => renderDetailed(r));
                  y += 2;
              });
          }
          
          if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) {
              FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
          } else if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
              PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
          }
          
          if(opts.returnBlob) return doc.output('blob');
          const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
              ? PdfTheme.filename('Ressources')
              : `${state.data.title || 'Projet'} - Ressources - moteur.studio.pdf`;
          doc.save(filename);
          Utils.toast('Ressources PDF exportées !', 'success');
          if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `Ressources PDF générées (${opts.mode})`);
      }
  };

  