
  const PlanningBreakdown = {
addSceneToDay: (sceneIdArg) => {
        let sceneIdRaw = (sceneIdArg == null || sceneIdArg === '') ? null : sceneIdArg;
        if(!sceneIdRaw) {
            const dropdown = document.getElementById('scene-dropdown');
            sceneIdRaw = dropdown ? dropdown.value : null;
        }
        
        if(!sceneIdRaw) {
            Utils.toast('Veuillez sélectionner une scène', 'warning');
            return;
        }
        
        // Essayer de trouver la scène avec string OU number
        let scene = state.data.scenes.find(s => s.id === sceneIdRaw);
        if(!scene) {
            scene = state.data.scenes.find(s => s.id === parseInt(sceneIdRaw));
        }
        if(!scene) {
            scene = state.data.scenes.find(s => String(s.id) === sceneIdRaw);
        }
        
        if(!scene) {
            Utils.toast('Scène introuvable !', 'error');
            return;
        }
        
        const sceneId = scene.id; // Utiliser l'ID exact de la scène trouvée
        
        // Initialize tempShootDay if needed
        if(!Planning.tempShootDay) {
            Planning.tempShootDay = { 
                scenes: [], 
                callSheet: [] 
            };
        }
        
        if(!Planning.tempShootDay.scenes) {
            Planning.tempShootDay.scenes = [];
        }
        
        if(!Planning.tempShootDay.callSheet) {
            Planning.tempShootDay.callSheet = [];
        }
        
        // Check if already added
        if(Planning.tempShootDay.scenes.some(ref => ref.sceneId === sceneId)) {
            Utils.toast('Cette scène est déjà ajoutée', 'warning');
            return;
        }
        
        // Add scene
        Planning.tempShootDay.scenes.push({ sceneId: sceneId, startTime: '' });
        
        // Auto-add actors from this scene
        // v580 : la scene connait ses personnages PAR IDENTIFIANT ;
        // charsOfScene garde le nom en repli pour les donnees anciennes.
        {
            FicheLinks.charsOfScene(scene).forEach(character => {
                if(character && character.actor_id) {
                    // Check if already in callsheet
                    // v598 : passe par le modele — il pose les champs de
                    // transport et fait heriter le trajet d'une personne deja
                    // convoquee ce jour-la sur un autre poste.
                    PlanningTransport.model.ensure('actor', character.actor_id);
                }
            });
        }
        
        // Auto-sélectionner les acteurs des scènes
        PlanningBreakdown.autoSelectActorsForScenes();
        
        // Auto-sélectionner les techniciens selon le dépouillement
        PlanningBreakdown.autoSelectCrewForBreakdown();
        
        // Auto-remplir le lieu depuis la scène (première scène ajoutée uniquement)
        if(Planning.tempShootDay.scenes.length === 1) {
            // v580 : le lien decor de la scene (identifiant) fait foi ;
            // locOfScene ne decoupe le titre qu'en repli.
            {
                const loc = FicheLinks.locOfScene(scene);
                
                if(loc) {
                    // Meme regle que pickLocation : on pose le lien et le nom
                    // reel, et on n'herite du reste que dans le vide.
                    FDSLive.push('edit-locationId', loc.id || '');
                    FDSLive.push('edit-location', loc.realName || '');
                    const fill = (input, val) => { if(val && !FDSLive.get(input)) FDSLive.push(input, val); };
                    fill('edit-locationAddress', loc.address);
                    fill('edit-contactName', loc.contactName);
                    fill('edit-contactPhone', loc.contactPhone);
                    fill('edit-locationNotes', loc.accessNotes);
                    // Coordonnées héritées du décor : sans elles, pas de carte ni
                    // de lever / coucher de soleil sur la feuille de service.
                    if(loc.lat != null && loc.lng != null) {
                        fill('edit-locationLat', String(loc.lat));
                        fill('edit-locationLng', String(loc.lng));
                    }
                    const locSelect = document.getElementById('edit-location-select');
                    if(locSelect) locSelect.value = loc.name;

                    Utils.toast(`📍 Lieu "${loc.name}" auto-rempli depuis la scène`, 'success');
                }
            }
        }
    },
    
    removeSceneFromDay: (sceneId) => {
        if(!Planning.tempShootDay) return;
        
        Planning.tempShootDay.scenes = Planning.tempShootDay.scenes.filter(ref => String(ref.sceneId) !== String(sceneId));
        
        // Réinitialiser l'équipe selon les scènes restantes
        PlanningBreakdown.recalculateCallSheetForScenes();
    },
    
    // Recalculer la callsheet en fonction des scènes actuelles
    recalculateCallSheetForScenes: () => {
        if(!Planning.tempShootDay) return;
        
        // Collecter les acteurs et techniciens nécessaires pour les scènes restantes
        const neededActorIds = new Set();
        const neededCrewIds = new Set();
        
        (Planning.tempShootDay.scenes || []).forEach(sceneRef => {
            const scene = state.data.scenes.find(s => s.id === sceneRef.sceneId || String(s.id) === String(sceneRef.sceneId));
            if(!scene) return;
            
            // Acteurs via perso — v580 : par identifiants (charsOfScene garde
            // le nom en repli). Reste le cas historique du nom de COMEDIEN
            // ecrit en direct dans le champ perso.
            FicheLinks.charsOfScene(scene).forEach(ch => { if(ch && ch.actor_id) neededActorIds.add(ch.actor_id); });
            if(scene.perso) {
                scene.perso.split(/[,;]/).map(n => n.trim().toUpperCase()).forEach(charName => {
                    const actor = state.data.actors?.find(a => a.name.toUpperCase() === charName);
                    if(actor) neededActorIds.add(actor.id);
                });
            }
            
            // Acteurs via dépouillement COMEDIENS
            // L'identifiant fait foi ; le nom ne sert plus qu'aux elements pas
            // encore rattaches a une fiche. C'est ce repli qui empechait de
            // convoquer deux homonymes distinctement.
            if(scene.breakdown && scene.breakdown['COMEDIENS']) {
                scene.breakdown['COMEDIENS'].forEach(it => {
                    const id = Utils.bdId(it);
                    if(id && state.data.actors?.some(a => a.id === id)) { neededActorIds.add(id); return; }
                    const nm = Utils.bdText(it).toUpperCase();
                    const actor = state.data.actors?.find(a => a.name.toUpperCase() === nm);
                    if(actor) neededActorIds.add(actor.id);
                });
            }
            
            // Acteurs via dépouillement PERSONNAGES
            if(scene.breakdown && scene.breakdown['PERSONNAGES']) {
                scene.breakdown['PERSONNAGES'].forEach(it => {
                    const id = Utils.bdId(it);
                    const character = (id && state.data.characters?.find(c => c.id === id))
                        || state.data.characters?.find(c => c.name.toUpperCase() === Utils.bdText(it).toUpperCase());
                    if(character && character.actor_id) neededActorIds.add(character.actor_id);
                });
            }
            
            // Techniciens via dépouillement TECHNICIENS
            if(scene.breakdown && scene.breakdown['TECHNICIENS']) {
                scene.breakdown['TECHNICIENS'].forEach(it => {
                    const id = Utils.bdId(it);
                    if(id && state.data.crew?.some(c => c.id === id)) { neededCrewIds.add(id); return; }
                    const nm = Utils.bdText(it).toUpperCase();
                    const crew = state.data.crew?.find(c => c.name.toUpperCase() === nm);
                    if(crew) neededCrewIds.add(crew.id);
                });
            }
        });
        
        // Collecter les personnes à retirer
        const actorsToRemove = [];
        const crewToRemove = [];
        
        // Retirer les acteurs qui ne sont plus necessaires. Les cases et selects
        // du pane Formulaire n'existent plus : seul le modele compte.
        (Planning.tempShootDay.callSheet || []).forEach(call => {
            if(call.type === 'actor' && !neededActorIds.has(call.personId)) {
                actorsToRemove.push(call.personId);
            }
        });
        
        // Retirer les techniciens qui ne sont plus necessaires
        (Planning.tempShootDay.callSheet || []).forEach(call => {
            if(call.type === 'crew' && !neededCrewIds.has(call.personId)) {
                crewToRemove.push(call.personId);
            }
        });
        
        // Retirer du callSheet
        Planning.tempShootDay.callSheet = Planning.tempShootDay.callSheet.filter(call => {
            if(call.type === 'actor' && actorsToRemove.includes(call.personId)) return false;
            if(call.type === 'crew' && crewToRemove.includes(call.personId)) return false;
            return true;
        });
        
        // Nettoyer les transports "avec qui" pour les personnes retirées
        const allRemovedIds = [
            ...actorsToRemove.map(id => `actor_${id}`),
            ...crewToRemove.map(id => `crew_${id}`)
        ];
        
        Planning.tempShootDay.callSheet.forEach(call => {
            if(call.withWho && call.withWho.length > 0) {
                call.withWho = call.withWho.filter(id => !allRemovedIds.includes(id));
                
                // Plus personne en covoiturage : le mode de transport n'a plus
                // de sens et repart a vide.
                if(call.withWho.length === 0 && (PlanningTransport.isDriverMode(call.transport) || call.transport === 'with')) {
                    call.transport = '';
                }
            }
        });
    },
    
    // refreshBreakdownPreview affichait un apercu du depouillement dans le pane
    // Formulaire (#breakdown-preview) : supprimee en v566, la feuille de service
    // rend le depouillement complet et editable.
    
    // SELECTION DES PLANS D'UNE SCENE — rebranchee en v566 sur le sequencier de
    // la feuille de service. Les trois fonctions ci-dessous ne touchent que les
    // donnees ; l'affichage est remis d'aplomb par shotsRefresh, qui met a jour
    // le compteur et les cases EN PLACE plutot que de rejouer toute la feuille :
    // un re-rendu complet refermerait le volet de plans en cours d'utilisation.
    shotsRefresh: (sceneId) => {
        const ref = ((Planning.tempShootDay || {}).scenes || [])
            .find(r => r && String(r.sceneId) === String(sceneId));
        const sel = (ref && ref.selectedShots) || [];
        const box = document.getElementById('fdsw-shots-' + sceneId);
        if(box) {
            const total = (state.data.shots || []).filter(s => String(s.sceneId) === String(sceneId)).length;
            box.textContent = sel.length + '/' + total;
        }
        document.querySelectorAll(`input[data-fds-scene="${sceneId}"]`).forEach(cb => {
            cb.checked = sel.some(x => String(x) === cb.dataset.fdsShot);
        });
    },
    toggleShotSelection: (sceneId, shotId) => {
        if(!Planning.tempShootDay || state.currentRole === 'viewer') return;
        
        const sceneRef = Planning.tempShootDay.scenes.find(ref => ref.sceneId === sceneId || String(ref.sceneId) === String(sceneId));
        if(!sceneRef) return;
        
        if(!sceneRef.selectedShots) {
            sceneRef.selectedShots = [];
        }
        
        const idx = sceneRef.selectedShots.findIndex(x => String(x) === String(shotId));
        if(idx >= 0) {
            sceneRef.selectedShots.splice(idx, 1);
        } else {
            sceneRef.selectedShots.push(shotId);
        }
        
        PlanningBreakdown.shotsRefresh(sceneId);
    },
    
    selectAllShots: (sceneId) => {
        if(!Planning.tempShootDay || state.currentRole === 'viewer') return;
        
        const sceneRef = Planning.tempShootDay.scenes.find(ref => ref.sceneId === sceneId || String(ref.sceneId) === String(sceneId));
        if(!sceneRef) return;
        
        const sceneShots = state.data.shots ? state.data.shots.filter(s => s.sceneId === sceneId || String(s.sceneId) === String(sceneId)) : [];
        sceneRef.selectedShots = sceneShots.map(s => s.id);
        
        PlanningBreakdown.shotsRefresh(sceneId);
    },
    
    deselectAllShots: (sceneId) => {
        if(!Planning.tempShootDay || state.currentRole === 'viewer') return;
        
        const sceneRef = Planning.tempShootDay.scenes.find(ref => ref.sceneId === sceneId || String(ref.sceneId) === String(sceneId));
        if(!sceneRef) return;
        
        sceneRef.selectedShots = [];
        
        PlanningBreakdown.shotsRefresh(sceneId);
    },
    
   autoSelectActorsForScenes: () => {
        if(!Planning.tempShootDay || !Planning.tempShootDay.scenes) return;
        if(!Planning.tempShootDay.callSheet) Planning.tempShootDay.callSheet = [];
        
        // Fonction helper pour ajouter un acteur
        const addActorToCallSheet = (actorId) => {
            if(!actorId) return;
            
            // Cocher la checkbox
            const actorCheckbox = document.getElementById(`call-actor-${actorId}`);
            if(actorCheckbox && !actorCheckbox.checked) {
                actorCheckbox.checked = true;
            }
            
            // Ajouter au callSheet si pas déjà présent
            PlanningTransport.model.ensure('actor', actorId);
        };
        
        Planning.tempShootDay.scenes.forEach(sceneRef => {
            const scene = state.data.scenes.find(s => s.id === sceneRef.sceneId || String(s.id) === String(sceneRef.sceneId));
            if(!scene) return;
            
            // 1. Chercher via le champ "perso" de la scène
            if(scene.perso) {
                // v580 : personnages par identifiant (charsOfScene garde le
                // nom en repli) ; reste le nom de comedien ecrit en direct.
                FicheLinks.charsOfScene(scene).forEach(ch => { if(ch && ch.actor_id) addActorToCallSheet(ch.actor_id); });
                scene.perso.split(/[,;]/).map(n => n.trim().toUpperCase()).forEach(charName => {
                    const actor = state.data.actors?.find(a => a.name.toUpperCase() === charName);
                    if(actor) {
                        addActorToCallSheet(actor.id);
                    }
                });
            }
            
            // 2. Chercher via le dépouillement catégorie COMEDIENS
            if(scene.breakdown && scene.breakdown['COMEDIENS']) {
                scene.breakdown['COMEDIENS'].forEach(it => {
                    const id = Utils.bdId(it);
                    if(id && state.data.actors?.some(a => a.id === id)) { addActorToCallSheet(id); return; }
                    const actor = state.data.actors?.find(a => a.name.toUpperCase() === Utils.bdText(it).toUpperCase());
                    if(actor) {
                        addActorToCallSheet(actor.id);
                    }
                });
            }
            
            // 3. Chercher via le dépouillement catégorie PERSONNAGES (si liés à des acteurs)
            if(scene.breakdown && scene.breakdown['PERSONNAGES']) {
                scene.breakdown['PERSONNAGES'].forEach(it => {
                    const id = Utils.bdId(it);
                    const character = (id && state.data.characters?.find(c => c.id === id))
                        || state.data.characters?.find(c => c.name.toUpperCase() === Utils.bdText(it).toUpperCase());
                    if(character && character.actor_id) {
                        addActorToCallSheet(character.actor_id);
                    }
                });
            }
        });
    },
    
    // Auto-cocher les techniciens selon le dépouillement des scènes
    autoSelectCrewForBreakdown: () => {
        if(!Planning.tempShootDay || !Planning.tempShootDay.scenes) return;
        if(!Planning.tempShootDay.callSheet) Planning.tempShootDay.callSheet = [];
        
        // Collecter les techniciens cites par le depouillement. On retient
        // separement les IDENTIFIANTS (elements lies a une fiche) et les NOMS
        // (elements pas encore rattaches) : sans les ids, deux homonymes
        // seraient convoques ensemble ou pas du tout.
        const neededCrewNames = new Set();
        const neededCrewIdsBd = new Set();
        
        Planning.tempShootDay.scenes.forEach(sceneRef => {
            const scene = state.data.scenes.find(s => s.id === sceneRef.sceneId || String(s.id) === String(sceneRef.sceneId));
            if(scene && scene.breakdown && scene.breakdown['TECHNICIENS']) {
                scene.breakdown['TECHNICIENS'].forEach(it => {
                    const id = Utils.bdId(it);
                    if(id) neededCrewIdsBd.add(id);
                    else neededCrewNames.add(Utils.bdText(it).toUpperCase());
                });
            }
        });
        
        // Cocher les techniciens dont le nom est dans la liste ET les ajouter au callSheet
        state.data.crew.forEach(member => {
            if(neededCrewIdsBd.has(member.id) || neededCrewNames.has(member.name.toUpperCase())) {
                // Cocher la checkbox
                const crewCheckbox = document.getElementById(`call-crew-${member.id}`);
                if(crewCheckbox && !crewCheckbox.checked) {
                    crewCheckbox.checked = true;
                }
                
                // Ajouter au callSheet si pas déjà présent
                PlanningTransport.model.ensure('crew', member.id);
            }
        });
    },
    
    // refreshScenesList listait les scenes du jour et leurs plans dans le pane
    // Formulaire (#selected-scenes-list, #scene-dropdown). Supprimee en v566 :
    // le sequencier de la feuille de service fait tout cela, choix des plans
    // compris (colonne « Plans »).
    
    // updateBreakdownNeeds rendait le dépouillement EDITABLE dans le pane
    // Formulaire (ajout d'un oubli, note par categorie, retrait d'une categorie
    // de la FDS). Le pane a disparu en v565 : la fonctionnalite est rebranchee
    // en v566 sur le tableau DEPOUILLEMENT de la feuille de service, qui appelle
    // les memes Planning.bdAddExtra / bdRemoveExtra / bdSetNote / bdHide /
    // bdShow. Cette version est donc supprimee, elle faisait doublon.
    // onLocationSelect a ete supprimee (nettoyage v566) : elle ecrivait dans les
    // inputs du pane Formulaire, retire en v565. Le choix du decor passe
    // desormais par FDSLive.pickLocation, qui pose le lien locationId et
    // applique la regle des sources.
  };
