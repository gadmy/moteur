
  const StoreMigrations = {
      migrateShootingDays: () => {
        // Migrer les jours de tournage vers le nouveau format (startDate/endDate)
        if(!state.data.shootingDays) return;
        
        state.data.shootingDays.forEach(day => {
            // Si ancien format (date), convertir vers nouveau format
            if(day.date && !day.startDate) {
                day.startDate = day.date;
                day.endDate = day.date;
                delete day.date;
            }
            
            // Générer un nom basé sur les scènes si pas de nom
            if(!day.name) {
                if(day.scenes && day.scenes.length > 0 && state.data.scenes) {
                    const sceneInfos = day.scenes.map(sc => {
                        const sceneId = typeof sc === 'string' ? sc : sc.sceneId;
                        const sceneIndex = state.data.scenes.findIndex(s => s.id === sceneId);
                        const selectedShots = sc.selectedShots || [];
                        const shotCount = selectedShots.length;
                        return sceneIndex >= 0 ? { num: sceneIndex + 1, shots: shotCount } : null;
                    }).filter(Boolean);
                    
                    if(sceneInfos.length === 1) {
                        // Une seule scène : Sc.3 (5 pl.)
                        const info = sceneInfos[0];
                        day.name = `Sc.${info.num}` + (info.shots > 0 ? ` (${info.shots} pl.)` : '');
                    } else if(sceneInfos.length > 1) {
                        // Plusieurs scènes : Sc.3(3pl);5(5pl)
                        day.name = 'Sc.' + sceneInfos.map(info => 
                            info.shots > 0 ? `${info.num}(${info.shots}pl)` : `${info.num}`
                        ).join(';');
                    } else {
                        day.name = `Tournage ${day.startDate || ''}`;
                    }
                } else {
                    day.name = `Tournage ${day.startDate || ''}`;
                }
            }
        });
      },
      
      migrateBreakdownKeys: () => {
          // Migrer les anciennes clés DÉCORS/LIEUX vers DECORS-LIEUX
          if(state.data.scenes) {
              state.data.scenes.forEach(scene => {
                  if(scene.breakdown && scene.breakdown["DÉCORS/LIEUX"]) {
                      scene.breakdown["DECORS-LIEUX"] = scene.breakdown["DECORS-LIEUX"] || [];
                      scene.breakdown["DECORS-LIEUX"] = [...new Set([...scene.breakdown["DECORS-LIEUX"], ...scene.breakdown["DÉCORS/LIEUX"]])];
                      delete scene.breakdown["DÉCORS/LIEUX"];
                  }
              });
          }
      },
      
      getPersonInfo: (email) => {
          let ownerRoles = [];
          // Chercher dans l'équipe technique
          if(state.data?.crew) {
              const member = state.data.crew.find(c => c.email === email);
              if(member) {
                  if(member.ownerRoles) ownerRoles = member.ownerRoles;
                  return { name: member.name, role: member.role, ownerRoles: ownerRoles, type: 'crew', isOwner: member.isOwner };
              }
          }
          // Chercher dans les comédiens
          if(state.data?.actors) {
              const actor = state.data.actors.find(a => a.email === email);
              if(actor) return { name: actor.name, role: 'Comédien(ne)', ownerRoles: [], type: 'actor', isOwner: actor.isOwner };
          }
          // Retourner l'email par défaut
          return { name: email.split('@')[0], role: '', ownerRoles: [], type: '' };
      },
      
      getUserRoleInfo: (email) => {
          let text = '', icon = '', roleClass = '', extraRoles = [];
          
          // Chercher les infos de la personne
          const personInfo = StoreMigrations.getPersonInfo(email);
          
          // Propriétaire
          const isOwner = personInfo.isOwner || (state.currentRole === 'owner' && email === state.currentUser?.email);
          if(isOwner) {
              text = 'Propriétaire';
              icon = '👑';
              roleClass = 'owner';
              // Ajouter les rôles supplémentaires depuis ownerRoles
              if(personInfo.ownerRoles && personInfo.ownerRoles.length > 0) {
                  extraRoles = personInfo.ownerRoles.map(r => ({ icon: r.icon, name: r.name }));
              }
              return { text, icon, class: roleClass, extraRoles };
          }
          // Responsable budget global
          if(state.data?.budget?.manager === email) {
              return { text: 'Resp. Budget', icon: '💰', class: 'budget-manager', extraRoles: [] };
          }
          // Responsable département
          const deptManagers = state.data?.budget?.deptManagers || {};
          const depts = [{id:'image',name:'Image',icon:'📹'},{id:'lumiere',name:'Lumière',icon:'💡'},{id:'son',name:'Son',icon:'🎤'},{id:'realisation',name:'Réalisation',icon:'🎬'},{id:'decoration',name:'Décoration',icon:'🎨'},{id:'costumes',name:'Costumes',icon:'👗'},{id:'maquillage',name:'Maquillage',icon:'💄'},{id:'regie',name:'Régie',icon:'🎭'},{id:'production',name:'Production',icon:'💼'},{id:'transport',name:'Transport',icon:'🚗'},{id:'catering',name:'Catering',icon:'🍴'},{id:'postprod',name:'Post-prod',icon:'🎞️'},{id:'location',name:'Locations',icon:'🏠'},{id:'assurance',name:'Assurance',icon:'📋'}];
          for(const [deptId, manager] of Object.entries(deptManagers)) {
              if(manager.email === email) {
                  const dept = depts.find(d => d.id === deptId);
                  return { text: 'Resp. ' + (dept?.name || deptId), icon: dept?.icon || '📋', class: 'dept-manager', extraRoles: [] };
              }
          }
          // Rôle équipe (avec rôles multiples)
          if(state.data?.crew) {
              const member = state.data.crew.find(c => c.email === email);
              if(member) {
                  const extraRoles = member.roles ? member.roles.map(r => ({ icon: r.icon, name: r.name })) : [];
                  return { text: member.role || '', icon: '🎬', class: '', extraRoles };
              }
          }
          return { text: '', icon: '', class: '', extraRoles: [] };
      }
  };

  // StoreUpdates — sous-module B.1.2 : updates ciblés et debounced sur projects (scene, title, textField)