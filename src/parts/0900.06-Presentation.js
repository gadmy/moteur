
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
            <div onclick="app.Presentation.selectTeamMember(${Utils.jsArg(r.type)}, ${Utils.jsArg(r.id)}, ${Utils.jsArg(r.name || '')}, ${Utils.jsArg(r.email || '')})" 
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
    
    // ==================================================================
    //  CE QUI SORT DU PROJET SE DECIDE, SECTION PAR SECTION (v601)
    // ==================================================================
    //  LA REGLE ETAIT ECRITE A TROIS ENDROITS (le defaut des boutons, le
    //  defaut de lecture, la liste des sections) et elle disait « tout est
    //  visible sauf le legal ». Publier un projet sortait donc d'un coup
    //  l'equipe, le casting et les dates, sans que personne ait rien demande.
    //  Elle vit maintenant ICI, une fois.
    //  LE CASTING ET L'EQUIPE PARTENT FERMES : ce sont les seules sections qui
    //  declenchent des CANDIDATURES. On ne se fait pas demarcher par accident.
    SECTIONS_VIS: [
        { id: 'description',    label: 'Note d’intention',       defaut: true,  obligatoire: true },
        { id: 'casting',        label: 'Rôles à distribuer',     defaut: false, note: 'Les comédien·nes pourront trouver vos rôles et se proposer.' },
        { id: 'crew',           label: 'Postes techniques',      defaut: false, note: 'Les technicien·nes pourront trouver vos postes et se proposer.' },
        { id: 'dates',          label: 'Dates de production',    defaut: true },
        { id: 'location',       label: 'Lieu de tournage',       defaut: true },
        { id: 'team',           label: 'Équipe déjà constituée', defaut: true },
        { id: 'productionType', label: 'Type de production',     defaut: true },
        { id: 'partners',       label: 'Partenaires',            defaut: true },
        { id: 'legal',          label: 'Informations légales',   defaut: false }
    ],
    //  Toujours publie, quoi qu'il arrive : c'est ce qui fait la vignette sur
    //  la carte. Sans cela il n'y a pas de projet a montrer.
    TOUJOURS_VISIBLE: ['Le titre', 'L’affiche', 'Le type de projet (film, série…)', 'Le genre'],

    _sectionVis: (id) => Presentation.SECTIONS_VIS.find(x => x.id === id) || null,
    _visDefaut: (id) => { const s = Presentation._sectionVis(id); return s ? s.defaut : true; },

    toggleSectionVisibility: (section) => {
        const btn = document.getElementById(`project-vis-btn-${section}`);
        if(!btn) return;
        const def = Presentation._sectionVis(section);
        if(def && def.obligatoire) {
            Utils.toast('La note d’intention est ce qu’on lit en premier sur la carte : elle reste visible tant que le projet est publié.', 'info', 6000);
            return;
        }
        const isHidden = btn.classList.toggle('hidden-section');
        Presentation.save();
        
        Utils.toast(isHidden ? `Section masquée dans l'Univers` : `Section visible dans l'Univers`, 'info');
    },
    
    updateVisibilityButtons: () => {
        const p = state.data.presentation || {};
        const vis = p.visibility || {};
        Presentation.SECTIONS_VIS.forEach(sec => {
            const btn = document.getElementById(`project-vis-btn-${sec.id}`);
            if(!btn) return;
            const isVisible = sec.obligatoire ? true
                            : (vis[sec.id] !== undefined ? vis[sec.id] : sec.defaut);
            btn.classList.toggle('hidden-section', !isVisible);
            btn.classList.toggle('vis-obligatoire', !!sec.obligatoire);
            if(sec.obligatoire) btn.title = 'Toujours visible tant que le projet est publié';
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
        // Le defaut vient de SECTIONS_VIS, plus d'un « true » recopie ici.
        const getVis = (section) => {
            const sec = Presentation._sectionVis(section);
            if(sec && sec.obligatoire) return true;
            const btn = document.getElementById(`project-vis-btn-${section}`);
            return btn ? !btn.classList.contains('hidden-section') : Presentation._visDefaut(section);
        };
        p.visibility = {};
        Presentation.SECTIONS_VIS.forEach(sec => { p.visibility[sec.id] = getVis(sec.id); });
        
        p.updatedAt = new Date().toISOString();
        
        Store.save();
        
        if(p.isPublic && !wasPublic) {
            // ON PASSE DE PRIVE A PUBLIC : c'est le seul moment ou la question
            // se pose vraiment, et le seul ou elle ne derange personne.
            Presentation.demanderVisibilites();
        } else if(p.isPublic) {
            Presentation.publishToUniverse();
        } else if(wasPublic && !p.isPublic) {
            Presentation.unpublishFromUniverse();
        }
    },

    // ==================================================================
    //  « QU'EST-CE QUI SORT ? » — LA QUESTION SE POSE UNE FOIS (v601)
    // ==================================================================
    //  Cocher « visible dans l'Univers » publiait tout d'un coup. On demande
    //  desormais, section par section, au moment ou l'on publie — et on
    //  rappelle ce qui sort de toute facon, pour qu'il n'y ait pas de
    //  surprise dans l'autre sens.
    //  ANNULER REMET LA CASE A SA PLACE : un ecran qu'on ferme ne doit pas
    //  laisser le projet publie a moitie.
    demanderVisibilites: () => {
        const p = state.data.presentation || {};
        const vis = p.visibility || {};
        const ov = document.createElement('div');
        ov.className = 'confirm-modal-overlay';
        ov.id = 'vis-modal';
        const ligne = (sec) => {
            if(sec.obligatoire) return '';
            const on = vis[sec.id] !== undefined ? vis[sec.id] : sec.defaut;
            return '<label class="vis-ligne">'
                + '<input type="checkbox" data-sec="' + sec.id + '" ' + (on ? 'checked' : '') + '>'
                + '<span class="vis-ligne-txt"><strong>' + Utils.escape(sec.label) + '</strong>'
                + (sec.note ? '<span>' + Utils.escape(sec.note) + '</span>' : '') + '</span>'
            + '</label>';
        };
        ov.innerHTML = '<div class="confirm-modal-box" style="max-width:540px;">'
            + '<h3 style="margin:0 0 4px;">🌍 Publier dans l’Univers</h3>'
            + '<p style="margin:0 0 14px; font-size:.82rem; color:var(--text-sec);">'
              + 'Choisissez ce que les autres verront. Vous pourrez le changer à tout moment, section par section, depuis cette page.</p>'
            + '<div class="vis-toujours"><strong>Toujours visible</strong><span>'
              + Presentation.TOUJOURS_VISIBLE.concat(['La note d’intention']).join(' · ')
              + '</span></div>'
            + '<div class="vis-liste">' + Presentation.SECTIONS_VIS.map(ligne).join('') + '</div>'
            + '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">'
              + '<button class="btn btn--secondary btn--sm" data-act="annuler">Ne pas publier</button>'
              + '<button class="btn btn--primary btn--sm" data-act="ok">Publier</button>'
            + '</div>'
        + '</div>';
        document.body.appendChild(ov);
        const fermer = () => { const m = document.getElementById('vis-modal'); if(m) m.remove(); };
        ov.addEventListener('click', (e) => {
            const act = e.target && e.target.dataset ? e.target.dataset.act : null;
            if(e.target === ov || act === 'annuler') {
                fermer();
                // On remet la case comme on l'a trouvee : rien n'est publie.
                const c = document.getElementById('project-public');
                if(c) c.checked = false;
                const pp = state.data.presentation || {};
                pp.isPublic = false;
                Store.save();
                Utils.toast('Projet non publié.', 'info');
                return;
            }
            if(act !== 'ok') return;
            const choix = {};
            ov.querySelectorAll('input[data-sec]').forEach(el => { choix[el.dataset.sec] = el.checked; });
            Presentation.SECTIONS_VIS.forEach(sec => {
                const val = sec.obligatoire ? true : !!choix[sec.id];
                const btn = document.getElementById('project-vis-btn-' + sec.id);
                if(btn) btn.classList.toggle('hidden-section', !val);
                (state.data.presentation.visibility = state.data.presentation.visibility || {})[sec.id] = val;
            });
            fermer();
            Store.save();
            Presentation.publishToUniverse();
        });
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
            // v601 : les roles publies sont les PERSONNAGES non castes, plus
            // une liste tenue a part qui disait le contraire au bout de deux
            // semaines. Voir Presentation.rolesACaster.
            actorNeeds: vis.casting !== false ? Presentation.rolesACaster() : [],
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
    
    // Les membres de l'equipe qui tiennent ce poste. On compare avec la meme
    // regle que la recherche de l'Univers — une seule facon de reconnaitre un
    // metier dans l'application, sinon les deux ecrans se contredisent.
    posteTenuPar: (pos) => {
        try {
            if(typeof Links !== 'undefined' && Links.masquee && Links.masquee('crew')) return [];
            const cherche = CastingMatch._mots(pos.name || '');
            const dept = CastingMatch._mots(pos.dept || '', true);
            return (state.data.crew || []).filter(m => {
                if(!m) return false;
                const declare = CastingMatch._mots(m.role || '');
                if(declare.length) {
                    if(cherche.some(x => declare.some(d => CastingMatch._memeMot(x, d)))) return true;
                    return declare.some(d => CastingMatch._memeFamille(d, cherche));
                }
                const dd = CastingMatch._mots(m.department || '', true);
                return dd.length > 0 && dd.some(d => cherche.some(x => CastingMatch._memeMot(x, d))
                                                 || dept.some(x => CastingMatch._memeMot(x, d))
                                                 || CastingMatch._memeFamille(d, cherche));
            }).map(m => m.name || 'Sans nom');
        } catch(e) { return []; }
    },

    renderCrewNeeds: () => {
        const container = document.getElementById('needs-crew-list');
        if(!container) return;
        
        if(!state.data.presentation) state.data.presentation = {};
        if(!state.data.presentation.crewNeeds) state.data.presentation.crewNeeds = {};
        
        const needs = state.data.presentation.crewNeeds;
        
        let html = '';
        Presentation.crewPositions.forEach(pos => {
            const need = needs[pos.id] || { needed: false, count: 1 };
            // QUI TIENT DEJA CE POSTE ? L'equivalent du « casté » d'un
            // comedien, pour un technicien, c'est « POURVU ». On le lit dans
            // l'equipe du projet, jamais recopie a la main.
            const tenu = Presentation.posteTenuPar(pos);
            const assez = tenu.length >= (need.count || 1);
            const etat = !need.needed ? ''
                : (tenu.length
                    ? '<span class="besoin-etat ' + (assez ? 'est-ok' : 'est-partiel') + '" title="'
                      + Utils.escape(tenu.join(', ')) + '">' + (assez ? '✅ pourvu' : '◑ ' + tenu.length + '/' + (need.count || 1))
                      + ' — ' + Utils.escape(tenu[0]) + (tenu.length > 1 ? ' +' + (tenu.length - 1) : '') + '</span>'
                    : '<span class="besoin-etat est-cherche">🔎 à pourvoir</span>');
            html += `<div class="besoin-poste${need.needed && assez ? ' est-comble' : ''}" style="display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--bg); border-radius: 6px;">
                <input type="checkbox" id="need-crew-${pos.id}" ${need.needed ? 'checked' : ''} onchange="app.Presentation.toggleCrewNeed('${pos.id}')" style="width: 18px; height: 18px;">
                <label for="need-crew-${pos.id}" style="flex: 1; cursor: pointer;">${pos.name}</label>
                ${etat}
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
    
    // ==================================================================
    //  LES PERSONNAGES SONT DES BESOINS, SANS QU'ON AIT A LES RECOPIER (v601)
    // ==================================================================
    //  « Si un personnage n'a pas de comedien lie, il va directement dans
    //  besoins comedien ; des qu'il est lie, il se marque casté. »
    //  C'est la bonne facon : la distribution EST deja saisie dans l'onglet
    //  Personnages. La recopier a la main, c'est deux listes a tenir a jour —
    //  et une qui ment des qu'on oublie. On lit donc la source.
    //  LES BESOINS ECRITS A LA MAIN RESTENT : tout n'est pas un personnage
    //  (« Touristes / villageois / hommes de main » n'en est pas un).
    rolesDuProjet: () => {
        try {
            if(typeof Links !== 'undefined' && Links.masquee && Links.masquee('character')) return null;
        } catch(e) {}
        const acteurs = state.data.actors || [];
        return (state.data.characters || []).map(c => {
            const a = c && c.actor_id ? acteurs.find(x => x && x.id === c.actor_id) : null;
            return {
                id: c.id, nom: c.name || 'Sans nom', caste: !!a, comedien: a ? (a.name || '') : '',
                // La description vient de la FICHE du personnage : c'est la
                // qu'on l'ecrit, on ne la redemande pas ailleurs.
                description: c.bio || '', genre: c.gender || '', age: c.storyAge || '',
                origine: c.ethnicity || '', cheveux: c.hairColor || ''
            };
        });
    },

    // ==================================================================
    //  LES ROLES A CASTER, POUR CEUX QUI CHERCHENT UN ROLE (v601)
    // ==================================================================
    //  Ce que l'Univers publie. UNE SEULE SOURCE : les personnages du projet
    //  qui n'ont pas encore de comedien. Un role distribue ne se cherche
    //  plus, il disparait donc de ce qui est publie — sans qu'on ait rien a
    //  decocher.
    //  On garde le format des anciens « besoins comediens » (roleName,
    //  gender, ageMin/ageMax...) : c'est ce que lisent le moteur de
    //  correspondance et la fiche publique du projet. On change la SOURCE,
    //  pas le contrat.
    rolesACaster: () => {
        const acteurs = state.data.actors || [];
        return (state.data.characters || [])
            .filter(c => c && !c.actor_id)
            .map(c => {
                const age = String(c.storyAge || '').match(/\d{1,3}/);
                return {
                    roleName: c.name || 'Rôle sans nom',
                    type: 'principal',
                    gender: c.gender || '',
                    ageMin: age ? String(Math.max(1, Number(age[0]) - 3)) : '',
                    ageMax: age ? String(Number(age[0]) + 3) : '',
                    ethnicity: c.ethnicity || '',
                    hairColor: c.hairColor || '',
                    count: 1,
                    description: c.bio || '',
                    characterId: c.id || ''
                };
            });
    },

    //  Le bouton de l'onglet Presentation : il ajoutait un role a la main,
    //  il ajoute maintenant un PERSONNAGE — c'est la meme chose, et il n'y a
    //  plus qu'un endroit ou l'ecrire.
    ajouterPersonnage: async () => {
        // v602 (audit) : la methode vit dans Actions ; le test sur UI
        // faisait sortir sans rien dire, le bouton ne faisait rien.
        if(typeof Actions === 'undefined' || !Actions.addDataItem) return;
        await Actions.addDataItem('characters');
        Presentation.renderActorNeeds();
    },

    // ==================================================================
    //  BESOINS COMEDIENS : UNE SEULE LISTE, CELLE DES PERSONNAGES (v601)
    // ==================================================================
    //  Il y avait DEUX listes : les personnages du projet, et des « roles a
    //  caster » ecrits a la main ici. Deux endroits pour dire la meme chose,
    //  donc deux endroits qui se contredisent au bout de deux semaines.
    //  Il n'en reste qu'une. Le bouton ajoute un PERSONNAGE, la description
    //  vient de SA fiche, et lier un comedien le marque « caste » sans qu'on
    //  ait rien a faire ici.
    renderActorNeeds: () => {
        const container = document.getElementById('needs-actors-list');
        if(!container) return;
        if(!state.data.presentation) state.data.presentation = {};
        Presentation._reprendreAnciensRoles();

        const esc = Utils.escape;
        const roles = Presentation.rolesDuProjet();
        if(roles === null) {
            container.innerHTML = '<div class="besoin-auto-note">Vous n’avez pas accès aux personnages de ce projet.</div>';
            return;
        }
        if(!roles.length) {
            container.innerHTML = '<div style="color: var(--text-sec); text-align: center; padding: 20px; background: var(--bg); border-radius: 8px;">'
                + 'Aucun personnage pour l’instant. Ajoutez-en un : tant qu’il n’a pas de comédien, il apparaît ici et dans les recherches de rôles de l’Univers.</div>';
            return;
        }
        const aDistribuer = roles.filter(r => !r.caste).length;
        const GENRES = { homme: 'Homme', femme: 'Femme', 'non-binaire': 'Non-binaire', 'non-precise': 'Non précisé', H: 'Homme', F: 'Femme' };
        container.innerHTML = '<div class="besoins-auto">'
            + '<div class="besoins-auto-tete">🎭 Les personnages du projet'
            + ' <span class="besoin-compte">' + aDistribuer + ' à distribuer sur ' + roles.length + '</span></div>'
            + '<div class="besoins-auto-liste">'
            + roles.map(r => {
                const traits = [GENRES[r.genre] || '', r.age ? String(r.age) : '']
                    .filter(Boolean).join(' · ');
                return '<div class="besoin-ligne besoin-role' + (r.caste ? ' est-comble' : '') + '">'
                    + '<div class="besoin-role-txt">'
                        + '<span class="besoin-nom">' + esc(r.nom) + '</span>'
                        + (traits ? '<span class="besoin-traits">' + esc(traits) + '</span>' : '')
                        + (r.description ? '<span class="besoin-desc">' + esc(r.description) + '</span>' : '')
                    + '</div>'
                    + (r.caste
                        ? '<span class="besoin-etat est-ok" title="Rôle distribué">✅ casté — ' + esc(r.comedien) + '</span>'
                        : '<span class="besoin-etat est-cherche">🔎 à distribuer</span>')
                + '</div>';
            }).join('')
            + '</div>'
            + '<div class="besoin-auto-note">Cette liste suit l’onglet Personnages : la description vient de la fiche, et lier un comédien marque le rôle « casté ». Les rôles à distribuer sont ceux que voient les comédien·nes qui cherchent un projet.</div>'
            + '</div>';
    },

    //  LES ANCIENS ROLES ECRITS A LA MAIN NE SONT PAS JETES : ils DEVIENNENT
    //  des personnages, une fois pour toutes. Les effacer aurait fait
    //  disparaitre sans prevenir des roles deja publies ; les laisser dans
    //  leur coin aurait garde les deux listes qu'on voulait justement
    //  reunir. Un role qui porte deja le nom d'un personnage est simplement
    //  abandonne : la fiche existe, elle fait foi.
    _reprendreAnciensRoles: () => {
        const anciens = state.data.presentation.actorNeeds;
        if(!Array.isArray(anciens) || !anciens.length) return;
        if(state.currentRole === 'viewer') return;
        if(!Array.isArray(state.data.characters)) state.data.characters = [];
        const cle = (v) => String(v || '').toLowerCase().trim();
        const connus = {};
        state.data.characters.forEach(c => { if(c) connus[cle(c.name)] = 1; });
        let repris = 0;
        anciens.forEach(n => {
            const nom = (n && n.roleName || '').trim();
            if(!nom || connus[cle(nom)]) return;
            connus[cle(nom)] = 1;
            repris++;
            state.data.characters.push({
                id: 'char_' + Utils.generateUniqueId(),
                name: nom,
                bio: n.description || '',
                group_id: '',
                gender: n.gender || '',
                storyAge: (n.ageMin || n.ageMax) ? [n.ageMin, n.ageMax].filter(Boolean).join(' - ') + ' ans' : '',
                ethnicity: n.ethnicity || '',
                hairColor: n.hairColor || ''
            });
        });
        state.data.presentation.actorNeeds = [];
        Store.save();
        if(repris) {
            Utils.toast(repris + (repris > 1 ? ' rôles écrits à la main sont devenus des personnages.' : ' rôle écrit à la main est devenu un personnage.'), 'info', 8000);
            try { UI.renderDataTab('characters', els.charContainer); } catch(e) {}
        }
    },

    //  Ancien nom du bouton, garde parce que des visites guidees et de
    //  vieux liens l'appellent encore : il mene maintenant a la seule porte.
    
    //  updateActorNeed / removeActorNeed retirees en v601 : plus personne ne
    //  les appelle, la liste qu'elles modifiaient n'existe plus. Un role se
    //  change dans la fiche du personnage, et se supprime avec elle.

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
                return `<div onclick="app.Presentation.addPartner('${type}', ${Utils.jsArg(o.id)}, ${Utils.jsArg(o.name)}, '')"
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
