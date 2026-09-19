
  const ProfileSkills = {
    // ========== LANGUES ET SPORTS AVEC NIVEAUX ==========
    languageLevels: {
        'notions': '📘 Notions',
        'intermediaire': '📗 Intermédiaire', 
        'courant': '📙 Courant',
        'bilingue': '📕 Bilingue',
        'maternelle': '🏠 Maternelle'
    },
    sportLevels: {
        'debutant': '🌱 Débutant',
        'amateur': '⭐ Amateur',
        'confirme': '⭐⭐ Confirmé',
        'competition': '🏆 Compétition',
        'professionnel': '👑 Pro'
    },
    
    addLanguage: async () => {
        const select = document.getElementById('profile-language-select');
        const levelSelect = document.getElementById('profile-language-level');
        let name = select.value;
        const level = levelSelect.value;
        
        if(!name) return;
        
        // Si "Autre", demander le nom
        if(name === '__custom__') {
            name = await ConfirmModal.prompt('Nom de la langue :', 'Ajouter une langue', 'Ex: Mandarin...');
            if(!name || !name.trim()) { select.value = ''; return; }
            name = name.trim();
        }
        
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile) return;
        
        if(!profile.languagesWithLevels) profile.languagesWithLevels = [];
        
        // Vérifier si déjà ajouté
        if(profile.languagesWithLevels.some(l => l.name.toLowerCase() === name.toLowerCase())) {
            Utils.toast('Cette langue est déjà ajoutée', 'warning');
            select.value = '';
            return;
        }
        
        profile.languagesWithLevels.push({ name, level });
        ProfileSkills.renderLanguagesList();
        select.value = '';
    },
    
    removeLanguage: (idx) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile || !profile.languagesWithLevels) return;
        profile.languagesWithLevels.splice(idx, 1);
        ProfileSkills.renderLanguagesList();
    },
    
    renderLanguagesList: () => {
        const container = document.getElementById('profile-languages-list');
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!container || !profile) return;
        
        const langs = profile.languagesWithLevels || [];
        container.innerHTML = langs.map((l, i) => `
            <span class="n8-flex-2">
                <strong>${Utils.escape(l.name)}</strong>
                <span class="text-sec">${ProfileSkills.languageLevels[l.level] || l.level}</span>
                <span onclick="app.ProfileSkills.removeLanguage(${i})" style="cursor:pointer; color:var(--danger); margin-left:3px;">✖</span>
            </span>
        `).join('');
        
        // Mise à jour du champ caché pour compatibilité
        document.getElementById('profile-languages').value = langs.map(l => `${l.name} (${l.level})`).join(', ');
    },
    
    addSport: async () => {
        const select = document.getElementById('profile-sport-select');
        const levelSelect = document.getElementById('profile-sport-level');
        let name = select.value;
        const level = levelSelect.value;
        
        if(!name) return;
        
        // Si "Autre", demander le nom
        if(name === '__custom__') {
            name = await ConfirmModal.prompt('Nom du sport ou compétence :', 'Ajouter une compétence', 'Ex: Escalade...');
            if(!name || !name.trim()) { select.value = ''; return; }
            name = name.trim();
        }
        
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile) return;
        
        if(!profile.sportsWithLevels) profile.sportsWithLevels = [];
        
        // Vérifier si déjà ajouté
        if(profile.sportsWithLevels.some(s => s.name.toLowerCase() === name.toLowerCase())) {
            Utils.toast('Ce sport est déjà ajouté', 'warning');
            select.value = '';
            return;
        }
        
        profile.sportsWithLevels.push({ name, level });
        ProfileSkills.renderSportsList();
        select.value = '';
    },
    
    removeSport: (idx) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile || !profile.sportsWithLevels) return;
        profile.sportsWithLevels.splice(idx, 1);
        ProfileSkills.renderSportsList();
    },
    
    renderSportsList: () => {
        const container = document.getElementById('profile-sports-list');
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!container || !profile) return;
        
        const sports = profile.sportsWithLevels || [];
        container.innerHTML = sports.map((s, i) => `
            <span class="n8-flex-2">
                <strong>${Utils.escape(s.name)}</strong>
                <span class="text-sec">${ProfileSkills.sportLevels[s.level] || s.level}</span>
                <span onclick="app.ProfileSkills.removeSport(${i})" style="cursor:pointer; color:var(--danger); margin-left:3px;">✖</span>
            </span>
        `).join('');
        
        // Mise à jour du champ caché pour compatibilité
        document.getElementById('profile-sports').value = sports.map(s => `${s.name} (${s.level})`).join(', ');
    },
    
    // Migration des anciennes données texte vers le nouveau format
    migrateSkillsData: (profile) => {
        // Migrer les langues
        if(profile.languages && typeof profile.languages === 'string' && !profile.languagesWithLevels) {
            profile.languagesWithLevels = profile.languages.split(',').map(l => l.trim()).filter(l => l).map(l => ({
                name: l.replace(/\s*\([^)]*\)\s*$/, '').trim(),
                level: 'courant'
            }));
        }
        // Migrer les sports
        if(profile.sports && typeof profile.sports === 'string' && !profile.sportsWithLevels) {
            profile.sportsWithLevels = profile.sports.split(',').map(s => s.trim()).filter(s => s).map(s => ({
                name: s.replace(/\s*\([^)]*\)\s*$/, '').trim(),
                level: 'confirme'
            }));
        }
    },
  };
