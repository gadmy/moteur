
  const GroupDnD = {
      _init: false,
      _coll: null,
      _idx: null,
      _el: null,
      _defaultIds: null,

      defaultIds: () => {
          if(!GroupDnD._defaultIds) {
              GroupDnD._defaultIds = new Set([...(CONFIG.defaultGroups || []), ...(CONFIG.crewGroups || [])].map(g => g.id));
          }
          return GroupDnD._defaultIds;
      },
      isDefault: (id) => GroupDnD.defaultIds().has(id),

      delBtnHtml: (coll, groupId, isView) => {
          if(isView || GroupDnD.isDefault(groupId)) return '';
          return `<button class="group-del-btn" type="button" title="Supprimer ce groupe" onclick="event.stopPropagation(); app.GroupDnD.deleteGroup('${coll}','${groupId}')">🗑️</button>`;
      },

      rerender: (coll) => {
          if(coll === 'characters') UI.renderDataTab('characters', els.charContainer);
          else if(coll === 'actors') UI.renderDataTab('actors', els.actorContainer);
          else if(coll === 'locations') UI.renderDataTab('locations', els.locContainer);
          else if(coll === 'crew') UI.renderCrewTab();
          else if(coll === 'orgs') Orgs.render();
          else if(coll === 'resources') Resources.render();
      },

      move: (coll, idx, groupId) => {
          // Ceinture et bretelles : le glisser est deja refuse au depart sur un
          // onglet en lecture seule, mais l'ecriture se verifie ici aussi —
          // griser n'est qu'un affichage tant que l'enregistrement ne controle rien.
          const KIND = { characters: 'character', actors: 'actor', locations: 'location', crew: 'crew', orgs: 'org', resources: 'resource' };
          if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && KIND[coll]
             && !Permissions.canEditFiche(KIND[coll])) {
              Utils.toast("Vous n'avez pas les droits de modification sur cette section.", 'error');
              return;
          }
          const arr = state.data[coll];
          const item = arr && arr[idx];
          if(!item) return;
          if((item.group_id || '') === (groupId || '')) return;
          // Chantier 4 : le glisser suit la meme regle que le selecteur — une
          // fiche sans scene ne se range pas ailleurs sans l'exemption.
          if(groupId && FicheLinks.isSansScene(coll, item)) {
              Utils.toast('Cette fiche n\'apparaît dans aucune scène : elle reste dans « Sans scène ». Cochez « 📌 Classement manuel » sur sa fiche pour la ranger ailleurs.', 'warning');
              GroupDnD.rerender(coll);
              return;
          }
          item.group_id = groupId || '';
          Store.save();
          GroupDnD.rerender(coll);
      },

      deleteGroup: (coll, groupId) => {
          if(GroupDnD.isDefault(groupId)) { Utils.toast('Ce groupe par défaut ne peut pas être supprimé.', 'warning'); return; }
          const grp = (state.data.groups || []).find(g => g.id === groupId);
          if(!grp) return;
          const arr = state.data[coll] || [];
          const count = arr.filter(it => it.group_id === groupId).length;
          const msg = count > 0
              ? `Supprimer le groupe « ${Utils.escape(grp.name)} » ?<br>Les ${count} fiche(s) qu'il contient repasseront en « Non classé ».`
              : `Supprimer le groupe « ${Utils.escape(grp.name)} » ?`;
          ConfirmModal.confirmDelete(msg, 'Supprimer le groupe ?').then(ok => {
              if(!ok) return;
              arr.forEach(it => { if(it.group_id === groupId) it.group_id = ''; });
              state.data.groups = (state.data.groups || []).filter(g => g.id !== groupId);
              Store.save();
              GroupDnD.rerender(coll);
          });
      },

      init: () => {
          if(GroupDnD._init) return;
          GroupDnD._init = true;
          document.addEventListener('dragstart', GroupDnD._onStart, true);
          document.addEventListener('dragend', GroupDnD._onEnd, true);
          document.addEventListener('dragover', GroupDnD._onOver, true);
          document.addEventListener('drop', GroupDnD._onDrop, true);
      },
      _onStart: (e) => {
          const card = e.target.closest ? e.target.closest('.compact-card[draggable="true"]') : null;
          if(!card) return;
          // 31 aout — GARDE DE LECTURE SEULE. Les cartes redeviennent cliquables
          // sur un onglet en 👁️ (ouvrir une fiche est une lecture) ; il faut donc
          // dire ici, et non par le CSS, que les DEPLACER reste interdit. Sans
          // cela un collaborateur en lecture pourrait ranger les fiches dans
          // d'autres groupes, et move() enregistrerait.
          const tab = card.closest ? card.closest('.tab-content.is-perm-readonly') : null;
          if(tab) { try { e.preventDefault(); } catch(_) {} return; }
          GroupDnD._el = card;
          GroupDnD._coll = card.dataset.dndColl;
          GroupDnD._idx = parseInt(card.dataset.dndIdx, 10);
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(GroupDnD._idx)); } catch(_) {}
          card.classList.add('dnd-dragging');
          document.body.classList.add('dnd-active');
      },
      _onEnd: () => {
          if(GroupDnD._el) GroupDnD._el.classList.remove('dnd-dragging');
          document.querySelectorAll('.compact-cards-grid.dnd-over').forEach(g => g.classList.remove('dnd-over'));
          document.body.classList.remove('dnd-active');
          GroupDnD._el = null; GroupDnD._coll = null; GroupDnD._idx = null;
      },
      _onOver: (e) => {
          if(GroupDnD._coll == null) return;
          const grid = e.target.closest ? e.target.closest('.compact-cards-grid[data-dnd-group]') : null;
          if(!grid || grid.dataset.dndColl !== GroupDnD._coll) return;
          e.preventDefault();
          try { e.dataTransfer.dropEffect = 'move'; } catch(_) {}
          if(!grid.classList.contains('dnd-over')) {
              document.querySelectorAll('.compact-cards-grid.dnd-over').forEach(g => g.classList.remove('dnd-over'));
              grid.classList.add('dnd-over');
          }
      },
      _onDrop: (e) => {
          if(GroupDnD._coll == null) return;
          const grid = e.target.closest ? e.target.closest('.compact-cards-grid[data-dnd-group]') : null;
          if(!grid || grid.dataset.dndColl !== GroupDnD._coll) return;
          e.preventDefault();
          const coll = GroupDnD._coll, idx = GroupDnD._idx, groupId = grid.dataset.dndGroup || '';
          GroupDnD._onEnd();
          GroupDnD.move(coll, idx, groupId);
      }
  };

  // ========== LOADING SCREEN ==========
  // 🎬 SECRET: Triple-clic sur le titre "Moteur" dans le header pour tester le loader !