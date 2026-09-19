
  const Crew = {
    addMember: async () => {
        if(state.currentRole === 'viewer') return;
        if(state.currentRole !== 'owner' && !Permissions.canEdit('equipe')) {
            Utils.toast('Vous n\'avez pas la permission d\'ajouter des techniciens.', 'error');
            return;
        }
        
        const newMember = {
            id: Utils.generateUniqueId(),
            name: '',
            gender: '',
            role: '',
            email: '',
            phone: '',
            address: '',
            city: '',
            photo: '',
            hasVehicle: false,
            vehicleType: '',
            vehiclePlate: '',
            vehicleSeats: '',
            vehicleTrunk: false,
            vehicleNotes: '',
            availabilityText: '',
            availabilityDates: [],
            salaryGross: '',
            salaryNet: '',
            salaryBudget: '',
            dailyRate: '',
            rateCurrency: '€',
            rateType: 'Jour',
            notes: '',
            group_id: '',
            demoreel: '',
            galleryPhotos: []
        };
        
        state.data.crew.push(newMember);
        History.log('ADD', `Ajout technicien`, { target: { kind: 'crew', id: newMember.id, label: 'Nouveau technicien' }, link: { kind: 'crew', id: newMember.id } });
        Store.save();
        UI.renderCrewTab();
        
        // Afficher un message pour assigner un département
        Utils.toast('N\'oubliez pas d\'assigner un département au technicien !', 'info');
        CardModal.openCrew(state.data.crew.length - 1);
    },
    
    // Appelée quand on assigne un groupe à un technicien (depuis updateMember ou ici)
    addVehicle: async () => {
        if(state.currentRole === 'viewer') return;
        if(state.currentRole !== 'owner' && !Permissions.canEdit('equipe')) {
            Utils.toast('Vous n\'avez pas la permission d\'ajouter des véhicules.', 'error');
            return;
        }
        const name = await ConfirmModal.prompt('Nom du véhicule (ex: Trafic régie).', 'Nouveau véhicule', 'Nom...');
        if(!name) return;
        if(!state.data.vehicles) state.data.vehicles = [];
        const v = { id: Utils.generateUniqueId(), name: name, type: '', seats: '', licenseRequired: 'vl', notes: '' };
        state.data.vehicles.push(v);
        History.log('ADD', `Ajout véhicule : ${name}`);
        Store.save();
        Crew.renderVehicles();
    },
    updateVehicle: (idx, field, value) => {
        if(!Permissions.canEditFiche('vehicle')) return;
        if(!state.data.vehicles || !state.data.vehicles[idx]) return;
        state.data.vehicles[idx][field] = value;
        Store.saveDebounced();
    },
    removeVehicle: async (idx) => {
        if(state.currentRole === 'viewer') return;
        const v = (state.data.vehicles || [])[idx];
        if(!v) return;
        if(!(await ConfirmModal.confirmDelete(`Supprimer le véhicule "${v.name || 'sans nom'}" ?`))) return;
        state.data.vehicles.splice(idx, 1);
        Store.save();
        Crew.renderVehicles();
    },
    renderVehicles: () => {
        const c = document.getElementById('vehiclesContainer');
        if(!c) return;
        if(!state.data.vehicles) state.data.vehicles = [];
        const vehicles = state.data.vehicles;
        const ro = state.currentRole === 'viewer';
        const icons = { vl: '🚗', pl: '🚚', spl: '🚛' };
        c.innerHTML = `
            <h2 style="margin:24px 0 12px 0;">🚐 Véhicules de production <span class="text-sec" style="font-weight:400; font-size:0.85rem;">(${vehicles.length})</span></h2>
            ${vehicles.length === 0
                ? '<div class="text-sec" style="padding:12px 0;">Aucun véhicule de production. Ajoute-en via « Ajouter Véhicule ».</div>'
                : `<div class="compact-cards-grid">` + vehicles.map((v, idx) => {
                    const ic = icons[v.licenseRequired || 'vl'] || '🚐';
                    const sub = v.type ? Utils.escape(v.type) : '<em style="opacity:0.5">Type non défini</em>';
                    const actions = ro ? '' : `
                        <div class="compact-card-actions">
                            <button class="edit-btn" onclick="event.stopPropagation(); app.Crew.editVehicle(${idx})" title="Modifier">✏️</button>
                            <button class="delete-btn" onclick="event.stopPropagation(); app.Crew.removeVehicle(${idx})" title="Supprimer">🗑️</button>
                        </div>`;
                    return `<div class="compact-card" onclick="app.Crew.editVehicle(${idx})">${actions}${v.seats ? `<div class="compact-card-badge">${Utils.escape(String(v.seats))} pl.</div>` : ''}<div class="compact-card-photo">${ic}</div><div class="compact-card-name">${Utils.escape(v.name || 'Sans nom')}</div><div class="compact-card-role">${sub}</div></div>`;
                }).join('') + `</div>`}
        `;
    },
    editVehicle: (idx) => {
        const v = (state.data.vehicles || [])[idx];
        if(!v) return;
        const modal = document.getElementById('card-edit-modal');
        const body = document.getElementById('card-edit-modal-body');
        const titleEl = document.getElementById('card-edit-modal-title');
        const ro = state.currentRole === 'viewer';
        const licOpts = [['vl','VL (B)'],['pl','PL (C)'],['spl','SPL (CE)']];
        if(titleEl) titleEl.textContent = '🚐 Véhicule : ' + (v.name || 'Sans nom');
        if(body) body.innerHTML = `
            <div class="crew-row">
                <input class="crew-input" placeholder="Nom du véhicule" data-tooltip="Nom du véhicule" value="${Utils.escape(v.name || '')}" onchange="app.Crew.updateVehicle(${idx}, 'name', this.value)" ${ro ? 'disabled' : ''}>
                <input class="crew-input" placeholder="Type (ex: minibus 9 places)" data-tooltip="Type (ex: minibus 9 places)" value="${Utils.escape(v.type || '')}" onchange="app.Crew.updateVehicle(${idx}, 'type', this.value)" ${ro ? 'disabled' : ''}>
            </div>
            <div class="crew-row" style="margin-top:10px;">
                <input class="crew-input" type="number" min="1" max="80" placeholder="Nb places (conducteur inclus)" data-tooltip="Nb places (conducteur inclus)" value="${Utils.escape(String(v.seats || ''))}" onchange="app.Crew.updateVehicle(${idx}, 'seats', this.value)" ${ro ? 'disabled' : ''}>
                <select class="crew-input" onchange="app.Crew.updateVehicle(${idx}, 'licenseRequired', this.value)" ${ro ? 'disabled' : ''}>
                    ${licOpts.map(([lv,llbl]) => `<option value="${lv}" ${(v.licenseRequired||'vl')===lv ? 'selected' : ''}>Permis ${llbl}</option>`).join('')}
                </select>
            </div>
            <textarea class="crew-input" style="margin-top:10px; width:100%; height:80px; resize:vertical;" placeholder="Notes (immat, état, contraintes...)" data-tooltip="Notes (immat, état, contraintes...)" onchange="app.Crew.updateVehicle(${idx}, 'notes', this.value)" ${ro ? 'disabled' : ''}>${Utils.escape(v.notes || '')}</textarea>
            ${UI.renderCost('vehicle', v.id)}
        `;
        CardModal.applyRights('vehicle');
        if(modal) modal.classList.add('visible');
    },
    syncCrewMemberToScenes: (member) => {
        if(!member || !member.name) return;
        
        const essentialGroups = ['gc1', 'gc3', 'gc4']; // Image, Réalisation, Son
        
        // Si le technicien est dans un groupe essentiel, l'ajouter à toutes les scènes
        if(essentialGroups.includes(member.group_id)) {
            state.data.scenes.forEach(scene => {
                if(!scene.breakdown) scene.breakdown = {};
                if(!scene.breakdown['TECHNICIENS']) scene.breakdown['TECHNICIENS'] = [];
                if(!scene.breakdown['TECHNICIENS'].some(it => Utils.bdId(it) === member.id || Utils.bdSameText(it, member.name))) {
                    scene.breakdown['TECHNICIENS'].push(Utils.bdItem(member.name, 'TECHNICIENS', member.id));
                }
            });
        }
        
        // Si le technicien est dans un groupe avec responsabilité catégorie, 
        // l'ajouter aux scènes qui ont des éléments de cette catégorie
        const categories = CONFIG.crewToBreakdownMap[member.group_id];
        if(categories) {
            state.data.scenes.forEach(scene => {
                if(!scene.breakdown) return;
                
                // Vérifier si la scène a des éléments dans une des catégories gérées
                const hasItems = categories.some(cat => 
                    scene.breakdown[cat] && scene.breakdown[cat].length > 0
                );
                
                if(hasItems) {
                    if(!scene.breakdown['TECHNICIENS']) scene.breakdown['TECHNICIENS'] = [];
                    if(!scene.breakdown['TECHNICIENS'].some(it => Utils.bdId(it) === member.id || Utils.bdSameText(it, member.name))) {
                        scene.breakdown['TECHNICIENS'].push(Utils.bdItem(member.name, 'TECHNICIENS', member.id));
                    }
                }
            });
        }
    },
    
    // Synchroniser les techniciens essentiels vers toutes les scènes
    syncEssentialCrewToScenes: () => {
        const essentialGroups = ['gc1', 'gc3', 'gc4']; // Image, Réalisation, Son
        const essentialMembers = state.data.crew.filter(c => essentialGroups.includes(c.group_id));
        
        state.data.scenes.forEach(scene => {
            if(!scene.breakdown) scene.breakdown = {};
            if(!scene.breakdown['TECHNICIENS']) scene.breakdown['TECHNICIENS'] = [];
            
            essentialMembers.forEach(member => {
                if(!scene.breakdown['TECHNICIENS'].some(it => Utils.bdId(it) === member.id || Utils.bdSameText(it, member.name))) {
                    scene.breakdown['TECHNICIENS'].push(Utils.bdItem(member.name, 'TECHNICIENS', member.id));
                }
            });
        });
    },
    
    deleteMember: async (idx) => {
        if(PublicProfile._engineMode) return;
        if(state.currentRole === 'viewer') return;
        
        // Récupérer l'ID et nom du membre avant suppression
        const memberId = state.data.crew[idx]?.id;
        const memberName = state.data.crew[idx]?.name || 'Sans nom';
        
        if(!await ConfirmModal.confirmDelete(`${memberName} sera retiré du projet, ainsi que ses convocations et dépenses de salaire associées.`, `Supprimer ${memberName} ?`)) return;
        if(typeof CardModal !== 'undefined' && CardModal.closeIfShowing) CardModal.closeIfShowing('crew', memberId);
        
        // Retirer des feuilles de service (callSheet) de tous les jours de tournage
        if(memberId && state.data.shootingDays) {
            state.data.shootingDays.forEach(day => {
                if(day.callSheet) {
                    day.callSheet = day.callSheet.filter(
                        call => !(call.personId === memberId && call.type === 'crew')
                    );
                }
            });
        }
        
        // Supprimer les dépenses de salaire associées
        if(memberId && state.data.expenses) {
            state.data.expenses = state.data.expenses.filter(
                e => !(e.salaryPersonId === memberId && e.salaryPersonType === 'crew')
            );
        }
        
        // [Phase D] Capturer le recoverable AVANT le splice (on a déjà supprimé en cascade plus haut)
        const memberToDelete = state.data.crew[idx];
        const crewLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const crewRecoverable = memberToDelete ? await History.captureRecoverable(memberToDelete, 'crew', crewLogId) : null;
        
        state.data.crew.splice(idx, 1);
        History.log('DELETE', `Suppression technicien : ${memberName}`, {
            target: { kind: 'crew', id: memberId, label: memberName },
            recoverable: crewRecoverable
        });
        Store.save();
        UI.renderCrewTab();
    },
    
    toggleCrewLicense: (idx, key, checked) => {
        const m = state.data.crew[idx];
        if(!m) return;
        let lic = Array.isArray(m.licenses) ? m.licenses.slice() : [];
        if(checked) { if(!lic.includes(key)) lic.push(key); } else { lic = lic.filter(k => k !== key); }
        Crew.updateMember(idx, 'licenses', lic);
    },
    updateMember: (idx, field, value) => {
        if(PublicProfile._engineMode) { const p = PublicProfile._engineProfile; if(p) p[field] = value; if(field === 'group_id' || field === 'professionalStatus' || field === 'collabType') PublicProfile._engineRerenderCard(); return; }
        if(state.currentRole === 'viewer') return;
        if(state.data.crew[idx] && state.data.crew[idx].publicProfileId && ['salaryGross','salaryNet','salaryBudget','dailyRate','rateCurrency','rateType','rateNegotiable'].indexOf(field) === -1) return; // P1 : lecture seule sauf cachet/statut (prod)
        if(!state.data.crew[idx]) return;
        
        const oldVal = state.data.crew[idx][field];
        state.data.crew[idx][field] = value;
        // Tracer en niveau minor (sera filtré en mode "essentiel")
        const fieldLabels = { licenses: 'permis', name: 'nom', email: 'email', phone: 'téléphone', role: 'rôle', city: 'ville', address: 'adresse', dailyRate: 'tarif', salaryGross: 'salaire brut', salaryNet: 'salaire net', salaryBudget: 'budget HT', group_id: 'département', photo: 'photo' };
        const fLabel = fieldLabels[field] || field;
        const memberName = state.data.crew[idx].name || 'technicien';
        const memberId = state.data.crew[idx].id;
        if(oldVal !== value) {
            History.log('EDIT', `Modification ${fLabel} de ${memberName}`, { target: { kind: 'crew', id: memberId, label: memberName }, link: { kind: 'crew', id: memberId } });
        }
        Store.saveDebounced();
        
        // Re-render role dropdown if group changed
        if(field === 'group_id') {
            UI.renderCrewTab();
            
            // Synchroniser le technicien vers les scènes appropriées
            const member = state.data.crew[idx];
            if(member) {
                Crew.syncCrewMemberToScenes(member);
                Store.saveDebounced();
            }
        }
        
        // Si on ajoute un email valide, vérifier si un profil public existe
        if(field === 'email' && value && value.includes('@') && value !== oldVal) {
            Actions.checkAndLinkPublicProfile(value, 'crew', idx).then(found => {
                if(!found) {
                    // Pas de profil existant, proposer de notifier pour créer
                    const member = state.data.crew[idx];
                    setTimeout(async () => {
                        if(await ConfirmModal.show({ title: 'Envoyer une invitation ?', message: `Aucun profil technicien trouvé pour ${value}.\n\nEnvoyer une invitation à ${Utils.escape(member.name)} pour créer son profil ?`, icon: '📨', confirmText: 'Inviter' })) {
                            Actions.notifyNewProfile(member, 'crew');
                        }
                    }, 300);
                }
            });
        }
    },
    
    toggleVehicle: (idx, hasVehicle) => {
        if(state.currentRole === 'viewer') return;
        if(!state.data.crew[idx]) return;
        
        state.data.crew[idx].hasVehicle = hasVehicle;
        Store.save();
        
        const vehicleDetails = document.getElementById(`crew-vehicle-${idx}`);
        if(vehicleDetails) {
            if(hasVehicle) {
                vehicleDetails.classList.add('visible');
            } else {
                vehicleDetails.classList.remove('visible');
            }
        }
    },
    
    uploadPhoto: async (idx, input) => {
        if(PublicProfile._engineMode) { await PublicProfile._engineUploadPhoto(input); return; }
        if(state.currentRole === 'viewer') return;
        if(!state.data.crew[idx]) return;
        if(!input.files || !input.files[0]) return;
        const file = input.files[0];
        input.value = ''; // reset pour permettre re-sélection du même fichier (avant async)
        Utils.toast('Envoi de la photo...', 'info', 1500);
        const member = state.data.crew[idx];
        const url = await Utils.uploadProjectFile(file, {
            category: 'crew',
            entityId: member.id || `idx${idx}`,
            kind: 'photo',
            maxDimension: 1280, quality: 0.85, maxKb: 400
        });
        if(!url) return;
        const hadCrewPhoto = !!member.photo;
        if(member.photo) await Utils.deleteProjectFile(member.photo);
        member.photo = url;
        const crewPhotoName = member.name || 'technicien';
        History.log('EDIT', `${hadCrewPhoto ? 'Modification' : 'Ajout'} photo principale de ${crewPhotoName}`, { target: { kind: 'crew', id: member.id, label: crewPhotoName }, link: { kind: 'crew', id: member.id } });
        Store.save();
        UI.renderCrewTab();
        CardModal.refresh();
    },
    
    addGalleryPhoto: async (idx) => {
        if(PublicProfile._engineMode) { await PublicProfile._engineAddGalleryPhoto(idx); return; }
        if(state.currentRole === 'viewer') return;
        if(!state.data.crew[idx]) return;
        const input = document.getElementById(`crew-gallery-input-${idx}`);
        if(!input || !input.files || !input.files[0]) { Utils.toast('Veuillez sélectionner une photo.', 'warning'); return; }
        const file = input.files[0];
        input.value = ''; // reset (avant async)
        Utils.toast('Envoi de la photo...', 'info', 1500);
        const member = state.data.crew[idx];
        const url = await Utils.uploadProjectFile(file, {
            category: 'crew',
            entityId: member.id || `idx${idx}`,
            kind: 'gallery',
            maxDimension: 1280, quality: 0.85, maxKb: 400
        });
        if(!url) return;
        if(!member.galleryPhotos) member.galleryPhotos = [];
        member.galleryPhotos.push(url);
        const crewGalName = member.name || 'technicien';
        History.log('ADD', `Ajout photo galerie pour ${crewGalName}`, { target: { kind: 'crew', id: member.id, label: crewGalName }, link: { kind: 'crew', id: member.id } });
        Store.save();
        UI.renderCrewTab();
        CardModal.refresh();
    },
    
    removeGalleryPhoto: async (crewIdx, photoIdx) => {
        if(PublicProfile._engineMode) {
            const d = PublicProfile._engineProfile;
            if(d && Array.isArray(d.galleryPhotos)) {
                const url = d.galleryPhotos[photoIdx];
                d.galleryPhotos.splice(photoIdx, 1);
                if(url && url.includes('/gallery/')) { const path = url.split('/gallery/')[1]; if(path) { try { await supabase.storage.from('gallery').remove([path]); } catch(e) {} } }
                PublicProfile._engineRerenderCard();
            }
            return;
        }
        if(state.currentRole === 'viewer') return;
        if(state.data.crew[crewIdx] && state.data.crew[crewIdx].galleryPhotos) {
            const member = state.data.crew[crewIdx];
            const crewRmName = member.name || 'technicien';
            const removedUrl = member.galleryPhotos[photoIdx];
            member.galleryPhotos.splice(photoIdx, 1);
            // [Phase D] On ne supprime PAS le fichier Storage (gardé dans le journal)
            const recoverable = removedUrl ? {
                text: null,
                media: [{ kind: 'gallery', label: `Photo galerie de ${crewRmName}`, url: removedUrl }],
                metadata: { crewId: member.id, crewName: crewRmName, photoIndex: photoIdx }
            } : null;
            History.log('DELETE', `Suppression photo galerie de ${crewRmName}`, {
                target: { kind: 'crew', id: member.id, label: crewRmName },
                recoverable: recoverable
            });
            Store.save();
            UI.renderCrewTab();
            CardModal.refresh();
        }
    },
    
    removeAvailabilityDate: (memberIdx, dateIdx) => {
        if(state.data.crew[memberIdx] && state.data.crew[memberIdx].availabilityDates) {
            state.data.crew[memberIdx].availabilityDates.splice(dateIdx, 1);
            Store.save();
            UI.renderCrewTab();
        }
    },
    
    removeUnavailabilityDate: (memberIdx, dateIdx) => {
        if(state.data.crew[memberIdx] && state.data.crew[memberIdx].unavailabilityDates) {
            state.data.crew[memberIdx].unavailabilityDates.splice(dateIdx, 1);
            Store.save();
            UI.renderCrewTab();
        }
    },
    
    addCustomRole: async (groupId) => {
        const newRole = await ConfirmModal.prompt("Entrez le nom de la nouvelle fonction.", "Nouvelle fonction", "Ex: Chef électricien...");
        if(!newRole) return;
        
        if(!CONFIG.crewRoles[groupId]) {
            CONFIG.crewRoles[groupId] = [];
        }
        
        if(!CONFIG.crewRoles[groupId].includes(newRole)) {
            CONFIG.crewRoles[groupId].push(newRole);
        }
        
        return newRole;
    },
    
    getRolesForGroup: (groupId) => {
        return CONFIG.crewRoles[groupId] || [];
    },
	// ===== EXPORT PDF — délégué à CrewExport =====
    openExportModal: (...a) => CrewExport.openExportModal(...a),
    exportPDF: (...a) => CrewExport.exportPDF(...a),
};

