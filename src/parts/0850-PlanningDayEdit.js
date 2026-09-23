
  const PlanningDayEdit = {
    // Le markup du formulaire portait des replis et des valeurs par defaut dans
    // ses attributs value=... : shootDay.startDate || shootDay.date, les
    // horaires 07:00 / 08:30 / 13:00 / 14:00 / 19:00, et le nom REEL du lieu
    // dans edit-location. Ils ont disparu avec le pane. Ils sont desormais poses
    // dans les donnees a l'ouverture du jour, ce qui est leur vraie place : un
    // jour cree par addShootDay ne porte que « date », et sans ce repli il
    // repartait avec startDate vide — donc invisible au calendrier apres
    // sauvegarde.
    normalizeTemp: () => {
        const t = Planning.tempShootDay;
        if(!t) return;
        if(!t.startDate) t.startDate = t.date || '';
        if(!t.endDate) t.endDate = t.startDate || '';
        if(!t.dayType) t.dayType = 'tournage';
        if(!t.crewCall) t.crewCall = '07:00';
        if(!t.readyToShoot) t.readyToShoot = '08:30';
        if(!t.lunchStart) t.lunchStart = '13:00';
        if(!t.lunchEnd) t.lunchEnd = '14:00';
        if(!t.estimatedWrap) t.estimatedWrap = '19:00';
        // 31 aout — LE DECOR N'EST PLUS ECRASE PAR LE LIEU REEL. Cette ligne
        // recopiait locationRealName dans location a chaque ouverture : la
        // feuille de service ne connaissait plus que le lieu de tournage, et
        // le nom du DECOR — celui qui figure au scenario — disparaissait des
        // la premiere sauvegarde. Les deux notions existent bien dans la fiche
        // decor (« CABINET D'AVOCATS LALA - PARIS » d'un cote, « Cabinet
        // Lalanne & Associes » de l'autre) et elles ont chacune leur usage :
        // le plan de travail annonce le decor, la feuille de service annonce
        // ou l'equipe se rend. On ne recopie donc plus que si le decor est
        // VIDE, pour les vieux jours qui n'ont jamais porte que le lieu reel.
        if(!t.location && t.locationRealName) t.location = t.locationRealName;
        if(!Array.isArray(t.scenes)) t.scenes = [];
        if(!Array.isArray(t.callSheet)) t.callSheet = [];
        // MIGRATION v567 — la figuration avait sa propre liste de presents.
        // Tout figurant qui n'y figurait QUE est reporte dans la convocation du
        // jour, avec son heure, sans quoi il disparaitrait de la feuille en
        // passant a la source unique.
        const oldFig = (t.figuration && Array.isArray(t.figuration.callSheet)) ? t.figuration.callSheet : [];
        oldFig.forEach(r => {
            if(!r || r.figurantId == null) return;
            const already = t.callSheet.some(cl => cl.type === 'actor' && String(cl.personId) === String(r.figurantId));
            if(already) return;
            t.callSheet.push({ type: 'actor', personId: r.figurantId, callTime: r.callTime || '',
                notes: r.notes || '', transport: '', withWho: [], vehicleId: '' });
        });
    },
    // Verrou de lecture seule de la feuille de service, calque sur
    // CardModal.applyRights : meme classe, meme banniere, meme regles CSS.
    // Le jour appartient a la section « planning » (Permissions.FICHE_SECTION),
    // ou qu'on l'ouvre — depuis le calendrier ou depuis une fiche comedien.
    // Les boutons Sauvegarder et Supprimer sont RETIRES plutot que grises :
    // un bouton qui ne fait rien est un piege. Annuler et Feuille de Service
    // restent, ils ne modifient rien.
    // « Griser un champ n'est qu'un affichage, tant que l'ecriture ne verifie
    // rien le droit n'existe pas » (regle posee en v575). Voici la verification,
    // ecrite UNE fois et appelee par les trois points d'ecriture de la feuille.
    // Elle remplace les tests state.currentRole === 'viewer' qui trainaient a
    // deux endroits : ceux-la laissaient passer un EDITEUR qui n'a que 👁️ sur
    // le planning — il n'est pas « viewer » au sens du role global.
    canWrite: () => {
        if(typeof Permissions === 'undefined' || !Permissions.canEditFiche) return true;
        return Permissions.canEditFiche('day');
    },

    applyRights: () => {
        const body = document.getElementById('planningModalBody');
        if(!body) return true;
        const ok = (typeof Permissions === 'undefined' || !Permissions.canEditFiche)
            ? true : Permissions.canEditFiche('day');
        const anc = body.querySelector('.perm-ro-banner');
        if(anc) anc.remove();
        body.classList.toggle('is-perm-readonly', !ok);
        if(!ok) {
            const d = document.createElement('div');
            d.className = 'perm-ro-banner';
            d.textContent = '\u{1F441} Lecture seule — vous n\'avez pas les droits de modification sur le planning.';
            body.prepend(d);
        }
        const btnSave = document.getElementById('planning-modal-save');
        if(btnSave) btnSave.style.display = ok ? '' : 'none';
        return ok;
    },

    showEditModal: (shootDay) => {
        // Store temp copy for editing
        Planning.tempShootDay = JSON.parse(JSON.stringify(shootDay));
        PlanningDayEdit.normalizeTemp();
        // v602 : un jour avec une equipe B s'ouvre sur la vue de l'equipe A.
        EquipeB.ouvrir();
        
        const modal = document.getElementById('planning-modal');
        const title = document.getElementById('planningModalTitle');
        const body = document.getElementById('planningModalBody');
        
        title.innerText = Planning.editingDayId === 'new' ? 'Nouveau Tournage' : `Modifier : ${shootDay.name || 'Tournage'}`;
        
        // Le pane Formulaire a ete retire : plus rien a construire ici.
        // La modale n'est plus qu'un jeu d'onglets sur deux vues autonomes.
        body.innerHTML = `
            <div class="fds-tabs">
                <button type="button" class="fds-tabbtn fds-tabbtn-active" onclick="app.Planning.switchFDSTab('live')">📄 Feuille de service</button>
                <button type="button" id="fds-tabbtn-figu" class="fds-tabbtn fds-tabbtn-dim" onclick="app.Planning.switchFDSTab('figu')">🎭 FDS figu ${shootDay.startDate ? new Date(shootDay.startDate).toLocaleDateString('fr-FR') : ''} <span role="button" title="Vider la feuille de figuration" onclick="event.stopPropagation(); app.Figuration.clearDay();" style="margin-left:6px; padding:0 4px; opacity:.6; cursor:pointer;">✖</span></button>
                <button type="button" id="fds-tabbtn-B" class="fds-tabbtn fds-tabbtn-dim" onclick="app.Planning.switchFDSTab('B')"></button>
            </div>
            <div id="fds-pane-live" style="display:none;"></div>
            <div id="fds-pane-figu" style="display:none;"></div>
        `;
        
        // Empilement : la feuille passe au-dessus de la fiche SEULEMENT quand
        // une fiche est reellement ouverte (voir la regle CSS .modal-over-fiche).
        // Le retrait est aussi important que la pose.
        const ficheOuverte = !!document.querySelector('#card-edit-modal.visible');
        modal.classList.toggle('modal-over-fiche', ficheOuverte);

        // 1er septembre — LA FEUILLE DE SERVICE N'AVAIT AUCUN VERROU DE LECTURE
        // SEULE, signale par Guillaume en testant avec un compte invite.
        // C'est le trou 2 de v575, resolu pour la fenetre de FICHE et jamais
        // pour celle-ci : les regles .is-perm-readonly ne visent que
        // .tab-content et .perm-ro-scope, or cette fenetre vit dans le corps de
        // la page, hors de tout onglet, et ne portait ni l'une ni l'autre.
        // Un lecteur pouvait donc saisir « Personnel sup », les oublis et
        // imprevus du depouillement, les notes de poste, le « rien a apporter »
        // et les colonnes de covoiturage. Rien n'etait enregistre, mais on
        // pouvait en faire une capture d'ecran credible — et surtout, la
        // regle [onclick] ne protegeait rien ici : ces champs sont des inputs
        // en oninput / onchange, que le selecteur ne voyait pas.
        // Le mecanisme existait deja et n'a pas ete reecrit : on POSE la classe
        // de portee sur le corps (en dur dans le HTML) et l'etat ici.
        PlanningDayEdit.applyRights();

        modal.classList.add('active');

        // Le bouton Supprimer vit dans le pied de modale, sur la meme ligne que
        // Annuler et Sauvegarder : place dans le corps, il donnait l'impression
        // de ne concerner que l'onglet ouvert alors qu'il supprime le jour
        // entier. Le pied etant statique, c'est ici qu'on le masque pour un
        // jour pas encore enregistre.
        const delBtn = document.getElementById('planning-modal-delete');
        // Masque pour un jour pas encore enregistre, ET pour qui n'a pas le
        // droit de modifier : un bouton de suppression qui ne supprime pas est
        // pire qu'absent.
        if(delBtn) delBtn.style.display = (Planning.editingDayId === 'new' || !PlanningDayEdit.canWrite()) ? 'none' : '';
        // Le pied etant statique, le choix d'impression survivrait d'un jour a
        // l'autre : on le referme a chaque ouverture.
        const printBox = document.getElementById('fds-print-choice');
        if(printBox) printBox.style.display = 'none';

        // Le pane Formulaire n'existe plus : rien a attendre avant de rendre la
        // feuille, d'ou la disparition du setTimeout de 100 ms qui laissait au
        // formulaire le temps de se peupler. L'auto-selection des comediens et
        // des techniciens mute tempShootDay et doit donc precede le rendu.
        Planning.autoSelectActorsForScenes();
        Planning.autoSelectCrewForBreakdown();
        Planning.switchFDSTab('live');
        Planning.refreshFDSTabs();
    },
    
closeModal: () => {
        EquipeB.fermer();
        document.getElementById('planning-modal').classList.remove('active');
        Planning.editingDayId = null;
        Planning.tempShootDay = null;
    },

    syncShootingDatesToProfiles: () => {
        // Collecter tous les jours de tournage avec leurs callsheets
        const shootingDays = state.data.shootingDays || [];
        const projectName = state.data.title || 'Projet';
        const projectId = state.currentProjectId;
        
        // Réinitialiser les shootingDates de tous les acteurs et techniciens pour ce projet
        (state.data.actors || []).forEach(actor => {
            if(!actor.shootingDates) actor.shootingDates = [];
            actor.shootingDates = actor.shootingDates.filter(sd => sd.projectId !== projectId);
        });
        (state.data.crew || []).forEach(member => {
            if(!member.shootingDates) member.shootingDates = [];
            member.shootingDates = member.shootingDates.filter(sd => sd.projectId !== projectId);
        });
        
        // Ajouter les nouvelles dates de tournage
        shootingDays.forEach(day => {
            if(!day.callSheet || !day.date) return;
            
            day.callSheet.forEach(call => {
                if(call.type === 'actor') {
                    const actor = state.data.actors.find(a => a.id === call.personId);
                    if(actor) {
                        if(!actor.shootingDates) actor.shootingDates = [];
                        actor.shootingDates.push({
                            date: day.date,
                            projectId: projectId,
                            projectName: projectName,
                            dayNumber: day.dayNumber,
                            callTime: call.callTime,
                            location: day.location
                        });
                    }
                } else if(call.type === 'crew') {
                    const member = state.data.crew.find(c => c.id === call.personId);
                    if(member) {
                        if(!member.shootingDates) member.shootingDates = [];
                        member.shootingDates.push({
                            date: day.date,
                            projectId: projectId,
                            projectName: projectName,
                            dayNumber: day.dayNumber,
                            callTime: call.callTime,
                            location: day.location
                        });
                    }
                }
            });
        });
        
        // Synchroniser vers les profils publics sur Supabase
        PlanningDayEdit.syncShootingDatesToPublicProfiles();
    },
    
    // Pousse les dates de tournage vers les profils publics (Supabase)
    syncShootingDatesToPublicProfiles: async () => {
        // Les dates de tournage sont maintenant stockées dans le projet lui-même
        // La synchronisation vers les profils publics se fera via le champ availability du user_profiles
        // Dates de tournage sauvegardées
    },
    
    // Deux onglets depuis le retrait du pane Formulaire (voie B, temps 3) :
    // 0 = Feuille de service, 1 = FDS figuration. 'normal' n'est plus une vue,
    // il est conserve comme alias de 'live' pour les anciens appels.
    // L'onglet figuration ne s'allume que si le jour est en feuille separee.
    // Eteint, il reste visible (pour qu'on sache qu'il existe) mais inerte.
    refreshFDSTabs: () => {
        // v602 : l'onglet de l'equipe B. Sans equipe B, il propose d'en creer
        // une ; avec, il porte son nom et une croix pour la supprimer.
        const bB = document.getElementById('fds-tabbtn-B');
        if(bB) {
            const full = Planning._jourComplet;
            bB.innerHTML = full
                ? '📄 ' + Utils.escape(EquipeB.nom(full)) + ' <span role="button" title="Supprimer cette feuille" onclick="event.stopPropagation(); app.EquipeB.supprimer();" style="margin-left:6px; padding:0 4px; opacity:.6; cursor:pointer;">✖</span>'
                : '➕ Équipe B';
            bB.title = full ? 'Deuxième feuille de service du même jour' : 'Ajouter une deuxième équipe qui tourne en parallèle le même jour';
        }
        const btn = document.getElementById('fds-tabbtn-figu');
        if(!btn) return;
        const on = !!(Planning.tempShootDay && Planning.tempShootDay.figuSplit);
        btn.style.opacity = on ? '' : '0.35';
        btn.style.cursor = on ? '' : 'not-allowed';
        btn.title = on ? '' : 'Active « Feuille de figuration séparée » sur la feuille de service pour utiliser cet onglet.';
    },
    switchFDSTab: (which) => {
        const paneF = document.getElementById('fds-pane-figu');
        const paneL = document.getElementById('fds-pane-live');
        if(!paneF || !paneL) return;
        // v602 : l'onglet B cree l'equipe au premier clic ; les deux autres
        // onglets sont ceux de la feuille principale (equipe A).
        if(which === 'B') {
            if(!Planning._jourComplet && !EquipeB.creer()) return;
            EquipeB.basculer('B');
        } else {
            EquipeB.basculer('A');
        }
        if(which === 'figu' && !(Planning.tempShootDay && Planning.tempShootDay.figuSplit)) {
            Utils.toast('La figuration est intégrée à la feuille de service. Coche « Feuille de figuration séparée » pour ouvrir cet onglet.', 'info');
            return;
        }
        const btns = document.querySelectorAll('.fds-tabbtn');
        const setActive = (i) => {
            btns.forEach((b, j) => {
                b.classList.toggle('fds-tabbtn-active', j === i);
                b.classList.toggle('fds-tabbtn-dim', j !== i);
            });
        };
        if(which === 'figu') {
            paneF.style.display = ''; paneL.style.display = 'none';
            setActive(1);
            Figuration.renderDays();
        } else {
            paneF.style.display = 'none'; paneL.style.display = '';
            setActive(which === 'B' ? 2 : 0);
            FDSLive.render();
        }
        PlanningDayEdit.refreshFDSTabs();
    },
    // ===== VOIE B — SOURCE DE VERITE UNIQUE : Planning.tempShootDay =====
    // Le pane Formulaire a ete retire (temps 3). La feuille de service ecrit
    // directement dans tempShootDay via FDSLive.push, le covoiturage passe par
    // PlanningTransport.model, et les heures de scene sont posees par
    // FDSLive.setSceneTime. Il n'y a donc plus rien a recopier depuis le DOM
    // avant de sauvegarder. La fonction est conservee, vide : elle reste le
    // point d'entree ou brancher une eventuelle mise a plat future, et evite
    // de toucher a saveShootDay pour la retirer.
    syncFormToTemp: () => {
        if(!Planning.tempShootDay) Planning.tempShootDay = {};
    },
    // Nom deduit des scenes du jour. Extrait de saveShootDay pour que la feuille
    // puisse AFFICHER le nom qui sera pose, au lieu de laisser l'utilisateur
    // deviner ce que « auto si vide » veut dire.
    autoDayName: (t, startDate) => {
        const d = t || {};
        const scenes = d.scenes || [];
        if(scenes.length > 0 && state.data.scenes) {
            const infos = scenes.map(ref => {
                const i = state.data.scenes.findIndex(s => s.id === ref.sceneId);
                return i >= 0 ? { num: i + 1, shots: (ref.selectedShots || []).length } : null;
            }).filter(Boolean);
            if(infos.length === 1) {
                return `Sc.${infos[0].num}` + (infos[0].shots > 0 ? ` (${infos[0].shots} pl.)` : '');
            }
            if(infos.length > 1) {
                return 'Sc.' + infos.map(i => i.shots > 0 ? `${i.num}(${i.shots}pl)` : `${i.num}`).join(';');
            }
        }
        const dt = startDate == null ? (d.startDate || '') : startDate;
        return `Tournage ${dt}`;
    },
    saveShootDay: () => {
        if(!PlanningDayEdit.canWrite()) { Utils.toast("Vous n'avez pas les droits de modification sur le planning.", 'error'); return; }
        
        PlanningDayEdit.syncFormToTemp();
        // v602 : si une equipe B existe, la vue ouverte rentre dans le jour
        // complet, qui est seul enregistre.
        EquipeB.complet();
        const t = Planning.tempShootDay || {};
        const v = (key) => (t[key] == null ? '' : String(t[key]));

        const startDate = v('startDate');
        const endDate = v('endDate') || startDate;
        
        // GARDE DU 25 AOUT — un jour sans date est un jour FANTOME : le
        // calendrier cherche les jours par leur date, celui-la n'y apparaît
        // jamais, mais il compte partout ailleurs (totaux, feuilles, coûts).
        // Plusieurs s'etaient accumules ainsi dans les projets de test. On
        // refuse l'enregistrement au lieu de creer l'orphelin.
        if(!startDate) {
            Utils.toast('Ce jour n\u2019a pas de date : renseigne-la avant d\u2019enregistrer, sinon il n\u2019apparaîtra dans aucun planning.', 'error');
            return;
        }
        
        // Générer le nom automatiquement si vide
        const name = v('name').trim() || PlanningDayEdit.autoDayName(t, startDate);

        // 31 aout : le numero n'est plus decide ici. Planning.renumberDays()
        // le recalcule pour TOUS les jours a partir des dates, juste avant
        // l'enregistrement — un numero pose au coup par coup redevenait faux
        // des qu'on changeait une date.
        const dayNumber = t.dayNumber || null;
        
        const shootDay = {
            id: Planning.editingDayId === 'new' ? Utils.generateUniqueId() : Planning.editingDayId,
            dayType: v('dayType') || 'tournage',
            startDate: startDate,
            endDate: endDate,
            // Double historique de startDate, seul lu par
            // syncShootingDatesToProfiles : sans lui les dates de tournage ne
            // remontent jamais dans les fiches comediens / techniciens.
            date: startDate,
            dayNumber: dayNumber,
            name: name,
            location: v('location'),
            // 31 aout : la sauvegarde recopiait le DECOR dans le lieu reel, ce
            // qui effacait ce dernier a chaque enregistrement. Le lieu reel est
            // desormais conserve tel qu'il est, avec repli sur le decor pour les
            // jours qui n'en ont jamais eu.
            locationRealName: v('locationRealName') || t.locationRealName || v('location'),
            locationAddress: v('locationAddress'),
            locationLat: v('locationLat') || null,
            locationLng: v('locationLng') || null,
            locationId: v('locationId') || null,
            locSync: t.locSync || {},
            contactName: v('contactName'),
            contactPhone: v('contactPhone'),
            locationNotes: v('locationNotes'),
            rdvFiguration: v('rdvFiguration'),
            hmcPlace: v('hmcPlace'),
            prodOffice: v('prodOffice'),
            techParking: v('techParking'),
            persoParking: v('persoParking'),
            crewCall: v('crewCall'),
            readyToShoot: v('readyToShoot'),
            lunchStart: v('lunchStart'),
            lunchEnd: v('lunchEnd'),
            estimatedWrap: v('estimatedWrap'),
            scenes: [],
            callSheet: [],
            notes: v('notes'),
            previsions: v('previsions'),
            extraStaff: v('extraStaff'),
            customWeather: v('customWeather'),
            meals: v('meals'),
            bdNotes: t.bdNotes || {},
            bdExtra: t.bdExtra || {},
            bdHidden: t.bdHidden || [],
            // Tableaux de distribution masques pour ce jour ('sil','dbl','figu')
            fdsHide: t.fdsHide || [],
            // Figuration sur sa propre feuille (true) ou nommee sur la feuille
            // principale (false, defaut)
            figuSplit: !!t.figuSplit,
            figuration: t.figuration || { groups: [] }
        };
        // v602 : l'en-tete de la feuille de l'equipe B (voir EquipeB).
        if(t.equipeB) shootDay.equipeB = t.equipeB;
        
        // Scenes et convocations : deja alignees par syncFormToTemp
        (t.scenes || []).forEach(ref => {
            const r = {
                sceneId: ref.sceneId,
                startTime: ref.startTime || '',
                selectedShots: ref.selectedShots || []
            };
            // v602 : la marque de l'equipe B voyage avec la scene.
            if(ref.equipe === 'B') r.equipe = 'B';
            shootDay.scenes.push(r);
        });
        shootDay.callSheet = (t.callSheet || []).map(cl => Object.assign({}, cl));
        
        // Save
        if(Planning.editingDayId === 'new') {
            if(!state.data.shootingDays) state.data.shootingDays = [];
            state.data.shootingDays.push(shootDay);
        } else {
            const idx = state.data.shootingDays.findIndex(sd => sd.id === shootDay.id);
            if(idx > -1) {
                state.data.shootingDays[idx] = shootDay;
            }
        }
        
        // Log historique
        const isNew = Planning.editingDayId === 'new';
        History.log(isNew ? 'ADD' : 'EDIT', `${isNew ? 'Ajout' : 'Modification'} tournage "${shootDay.name}" (${shootDay.startDate}${shootDay.endDate !== shootDay.startDate ? ' → ' + shootDay.endDate : ''})`);
        
        // ORDRE IMPORTANT : on renumerote AVANT de synchroniser les profils.
        // syncShootingDatesToProfiles RECOPIE dayNumber dans les fiches
        // comedien et technicien ; l'appeler d'abord y graverait l'ancien
        // numero, et l'infobulle de leur calendrier mentirait jusqu'a la
        // prochaine sauvegarde.
        Planning.renumberDays();
        
        // Synchroniser les calendriers des profils
        PlanningDayEdit.syncShootingDatesToProfiles();
        
        Store.save();
        Planning.closeModal();
        Planning.render();
        
        Utils.toast('Jour de tournage sauvegardé !', 'success');
    },
  };

  // ================== PLANNING - PLAN DE TRAVAIL (DOOD) ET KANBAN ==================
  // Extrait du coeur de Planning (v578). Deux vues « tableau » de l'onglet
  // Planning : le plan de travail (qui tourne quel jour) et le kanban des
  // scenes. Aucune logique nouvelle, le code est deplace tel quel.
  // Planning garde des facades : tous les onclick continuent d'appeler Planning.