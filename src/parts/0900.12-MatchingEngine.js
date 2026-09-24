
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
    // v601 : le selecteur liste desormais une ligne PAR CASQUETTE et aussi mes
    // PROJETS (voir CastingMatch). Quand la casquette a deja ete resolue, elle
    // est passee ici directement — l'ancien chemin par l'index du menu ne
    // suffisait plus, il ne savait designer qu'un profil entier.
    findProjectsForMe: (profilDonne) => {
        let profile = profilDonne || null;
        if(!profile) {
            const select = document.getElementById('universe-my-profile');
            if(!select || select.value === '') {
                Utils.toast('Veuillez sélectionner un profil', 'warning');
                return;
            }
            profile = Universe.myProfiles[parseInt(select.value)];
        }
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
            const profileAge = PublicProfile.ageDe(profile) || 0;   // v601 : date de naissance d'abord
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
        const profileAge = PublicProfile.ageDe(profile) || 0;   // v601 : date de naissance d'abord
        
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
