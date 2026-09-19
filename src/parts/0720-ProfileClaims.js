
  const ProfileClaims = {
    // Charge tous les profils de l'utilisateur depuis Supabase
    pendingClaims: [],
    
    // Charge les profils en attente de revendication
    loadPendingClaims: async () => {
        const email = state.currentUser.email.toLowerCase();
        
        try {
            const { data: notifications, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_email', email)
                .eq('type', 'profile_claim')
                .eq('read', false);
            
            if(!error && notifications) {
                ProfileClaims.pendingClaims = notifications.map(n => {
                    try {
                        return { ...JSON.parse(n.message), notificationId: n.id };
                    } catch(e) {
                        return null;
                    }
                }).filter(c => c !== null);
            } else {
                ProfileClaims.pendingClaims = [];
            }
            
            ProfileClaims.renderPendingClaims();
        } catch(e) {
            console.error('Erreur chargement claims:', e);
            ProfileClaims.pendingClaims = [];
        }
    },
    
    // Affiche les profils à revendiquer
    renderPendingClaims: () => {
        const section = document.getElementById('pending-claims-section');
        const list = document.getElementById('pending-claims-list');
        
        if(!section || !list) return;
        
        if(ProfileClaims.pendingClaims.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        
        list.innerHTML = ProfileClaims.pendingClaims.map(claim => {
            const typeIcon = claim.type === 'actor' ? '🎭' : '🎥';
            const typeLabel = claim.type === 'actor' ? 'Comédien·ne' : 'Technicien·ne';
            
            return `
                <div style="background: rgba(255,255,255,0.15); border-radius: 8px; padding: 15px; display: flex; align-items: center; gap: 15px;">
                    <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; overflow: hidden;">
                        ${claim.photo ? `<img src="${Utils.safeMediaUrl(claim.photo)}" alt="Photo de profil" class="img-cover">` : typeIcon}
                    </div>
                    <div class="flex-1">
                        <div class="fw-bold">${Utils.escape(claim.name)}</div>
                        <div style="font-size: 0.85rem; opacity: 0.9;">${typeLabel} • Créé par ${Utils.escape(claim.createdByName)} pour "${Utils.escape(claim.projectTitle)}"</div>
                    </div>
                    <button onclick="app.ProfileClaims.claimProfile('${claim.id}')" style="padding: 10px 20px; background: white; color: #764ba2; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
                        ✨ Revendiquer
                    </button>
                    <button onclick="app.ProfileClaims.rejectClaim('${claim.id}')" style="padding: 10px 15px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 6px; cursor: pointer;" title="Ignorer">
                        ✖
                    </button>
                </div>
            `;
        }).join('');
    },
    
    // Revendique un profil et le transforme en profil propre
    claimProfile: async (claimId) => {
        const claim = ProfileClaims.pendingClaims.find(c => c.id === claimId);
        if(!claim) return;
        
        if(!await ConfirmModal.show({ title: 'Revendiquer ce profil ?', message: `Le profil "${Utils.escape(claim.name)}" deviendra votre profil public que vous pourrez compléter.`, icon: '✋', confirmText: 'Revendiquer' })) return;
        
        const emailKey = Utils.sanitizeEmail(state.currentUser.email);
        
        try {
            // Créer un nouveau profil à partir du claim
            const newProfile = {
                id: 'profile_' + Utils.generateUniqueId(),
                type: claim.type,
                name: claim.name,
                email: state.currentUser.email,
                phone: claim.phone || '',
                photo: claim.photo || '',
                bio: claim.bio || '',
                gender: claim.gender || '',
                city: '',
                // Données acteur
                height: claim.height || '',
                age: claim.age || '',
                eyeColor: claim.eyeColor || '',
                hairColor: claim.hairColor || '',
                ethnicity: claim.ethnicity || '',
                languages: claim.languages || '',
                sports: claim.sports || '',
                // Données technicien
                role: claim.role || '',
                department: claim.department || '',
                dailyRate: claim.dailyRate || '',
                rateCurrency: claim.rateCurrency || '€',
                // Métadonnées
                claimedFrom: claimId,
                claimedAt: new Date().toISOString(),
                originalCreator: claim.createdBy,
                profileComplete: false
            };
            
            // Ajouter aux profils
            PublicProfile.profiles.push(newProfile);
            
            // Mettre à jour le profil utilisateur dans Supabase
            const email = state.currentUser.email.toLowerCase();
            const {error: upErr1} = await supabase.from('user_profiles').update({
                name: newProfile.name,
                phone: newProfile.phone,
                photo: newProfile.photo,
                bio: newProfile.bio,
                gender: newProfile.gender,
                profile_type: newProfile.type
            }).eq('email', email);
            if(upErr1) { console.error('Erreur MAJ profil:', upErr1); Utils.toast('Erreur mise à jour profil', 'error'); }
            
            // Mettre à jour l'acteur/technicien dans le projet d'origine avec le lien vers le profil public
            if(claim.projectId && claim.localId) {
                // v578 (cloisonnement) : lecture par la fonction serveur, et ecriture
                // limitee a la SEULE cle concernee. Avant, on relisait puis on
                // reecrivait le projet ENTIER pour poser un identifiant de profil sur
                // une fiche : toute modification faite ailleurs entre la lecture et
                // l'ecriture etait perdue.
                const { data: projData, error: errClaim } = await supabase.rpc('project_data_for_me', { p_id: claim.projectId });
                if(errClaim) console.warn('[Claim] project_data_for_me:', errClaim);
                
                if(projData) {
                    const listKey = claim.type === 'actor' ? 'actors' : 'crew';
                    const dataArray = projData[listKey];
                    if(dataArray) {
                        const idx = dataArray.findIndex(p => p.id === claim.localId);
                        if(idx !== -1) {
                            dataArray[idx].publicProfileId = newProfile.id;
                            const {error: claimErr} = await supabase.rpc('patch_project_data', {
                                p_id: claim.projectId,
                                p_patch: { [listKey]: dataArray }
                            });
                            if(claimErr) Utils.toast('Erreur mise à jour projet', 'error');
                        }
                    }
                }
            }
            
            // Supprimer la notification de claim
            if(claim.notificationId) {
                const {error: delNotifErr} = await supabase.from('notifications').delete().eq('id', claim.notificationId);
                if(delNotifErr) throw delNotifErr;
            }
            ProfileClaims.pendingClaims = ProfileClaims.pendingClaims.filter(c => c.id !== claimId);
            
            // Rafraîchir l'affichage
            ProfileClaims.renderPendingClaims();
            PublicProfile.renderProfileTabs();
            PublicProfile.currentProfileIndex = PublicProfile.profiles.length - 1;
            PublicProfile.loadProfileToForm(newProfile);
            document.getElementById('no-profile-message').style.display = 'none';
            document.getElementById('profile-all-sections').style.display = 'block';
            
            Utils.toast(`Profil "${claim.name}" revendiqué ! Complétez-le pour apparaître dans l'Univers.`, 'success');
        } catch(e) {
            console.error('Erreur revendication:', e);
            Utils.toast('Erreur lors de la revendication', 'error');
        }
    },
    
    // Rejette/ignore un claim
    rejectClaim: async (claimId) => {
        if(!await ConfirmModal.show({ title: 'Ignorer ce profil ?', message: 'Ce profil ne vous sera plus proposé.', icon: '🚫', confirmText: 'Ignorer' })) return;
        
        try {
            // Trouver la notification correspondante
            const claim = ProfileClaims.pendingClaims.find(c => c.id === claimId);
            if(claim && claim.notificationId) {
                const {error: delNotifErr2} = await supabase.from('notifications').delete().eq('id', claim.notificationId);
                if(delNotifErr2) throw delNotifErr2;
            }
            ProfileClaims.pendingClaims = ProfileClaims.pendingClaims.filter(c => c.id !== claimId);
            ProfileClaims.renderPendingClaims();
            Utils.toast('Profil ignoré.', 'info');
        } catch(e) {
            console.error('Erreur:', e);
        }
    },
  };
