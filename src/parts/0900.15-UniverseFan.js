
// --- MODULE UNIVERSE V86 ---
// ===== V2.1.6 — HUB CENTRAL =====

const UniverseFan = {
    // Boucle d'animation
    animate: () => {
        if(!Universe.animationRunning) return;
        
        const scene = document.getElementById('universe-scene');
        if(!scene) return;
        
        const rect = scene.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const cardWidth = 170;
        const cardHeight = 130;
        
        // Mettre à jour chaque carte
        Universe.cards.forEach(card => {
            // Mouvement
            card.x += card.vx;
            card.y += card.vy;
            card.rotation += card.rotationSpeed;
            
            // Limiter la rotation
            if(card.rotation > 8) { card.rotation = 8; card.rotationSpeed *= -0.5; }
            if(card.rotation < -8) { card.rotation = -8; card.rotationSpeed *= -0.5; }
            
            // Rebond sur les bords
            if(card.x <= 5) { card.x = 5; card.vx *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            if(card.x >= width - cardWidth - 5) { card.x = width - cardWidth - 5; card.vx *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            if(card.y <= 5) { card.y = 5; card.vy *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            if(card.y >= height - cardHeight - 5) { card.y = height - cardHeight - 5; card.vy *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            
            // Appliquer la position
            card.el.style.left = card.x + 'px';
            card.el.style.top = card.y + 'px';
            card.el.style.transform = `rotate(${card.rotation}deg)`;
        });
        
        // Collision entre cartes nettes (search-result et main)
        const netCards = Universe.cards.filter(c => !c.isBlurred);
        for(let i = 0; i < netCards.length; i++) {
            for(let j = i + 1; j < netCards.length; j++) {
                UniverseFan.handleCollision(netCards[i], netCards[j]);
            }
        }
        
        // Légère friction pour ralentir progressivement
        Universe.cards.forEach(card => {
            card.vx *= 0.999;
            card.vy *= 0.999;
            
            // Ajouter un peu de mouvement aléatoire pour garder les cartes en mouvement
            if(Math.random() < 0.01) {
                card.vx += (Math.random() - 0.5) * 0.1;
                card.vy += (Math.random() - 0.5) * 0.1;
            }
            
            // Vitesse max (réduite pour mouvement plus calme)
            const maxSpeed = card.isMain ? 0.5 : 0.8;
            const speed = Math.sqrt(card.vx * card.vx + card.vy * card.vy);
            if(speed > maxSpeed) {
                card.vx = (card.vx / speed) * maxSpeed;
                card.vy = (card.vy / speed) * maxSpeed;
            }
            
            // Vitesse min pour éviter l'arrêt complet
            if(speed < 0.05) {
                card.vx += (Math.random() - 0.5) * 0.1;
                card.vy += (Math.random() - 0.5) * 0.1;
            }
        });
        
        requestAnimationFrame(UniverseFan.animate);
    },
    
    // Gestion des collisions entre cartes
    handleCollision: (card1, card2) => {
        const dx = card2.x - card1.x;
        const dy = card2.y - card1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = 160;
        
        if(dist < minDist && dist > 0) {
            // Repousser les cartes
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            
            const pushForce = overlap * 0.15;
            
            if(!card1.isMain) {
                card1.x -= nx * pushForce;
                card1.y -= ny * pushForce;
                card1.vx -= nx * 0.2;
                card1.vy -= ny * 0.2;
            }
            
            if(!card2.isMain) {
                card2.x += nx * pushForce;
                card2.y += ny * pushForce;
                card2.vx += nx * 0.2;
                card2.vy += ny * 0.2;
            }
            
            // Petite rotation lors de la collision
            card1.rotationSpeed += (Math.random() - 0.5) * 0.05;
       card2.rotationSpeed += (Math.random() - 0.5) * 0.2;
        }
    },
    
    // Rendu en mode Éventail
    renderFanView: (scene) => {
        scene.innerHTML = '';
        scene.style.overflow = 'auto';
        
        const container = document.createElement('div');
        container.className = 'universe-fan-container';
        
        const myEmail = state.currentUser?.email;
        const myEmailKey = myEmail ? Utils.sanitizeEmail(myEmail) : null;
        
        // Dédupliquer les profils par email
        const uniqueProfiles = [];
        const seenEmails = new Set();
        Universe.allProfiles.forEach(p => {
            const key = p.email || p.id;
            if(!seenEmails.has(key)) {
                seenEmails.add(key);
                uniqueProfiles.push(p);
            }
        });
        
        // Dédupliquer les projets par ID
        const uniqueProjects = [];
        const seenProjectIds = new Set();
        Universe.allProjects.forEach(p => {
            const key = p.id || p.projectId;
            if(key && !seenProjectIds.has(key)) {
                seenProjectIds.add(key);
                uniqueProjects.push(p);
            }
        });
        
// Catégoriser les profils
        const actors = uniqueProfiles.filter(p => p.type === 'actor');
        const crew = uniqueProfiles.filter(p => p.type === 'crew');
        const associations = uniqueProfiles.filter(p => p.type === 'association');
        const enterprises = uniqueProfiles.filter(p => p.type === 'enterprise');
        const projects = uniqueProjects;
        
        // Trouver mon profil
        const myProfile = Universe.allProfiles.find(p => p.id === myEmailKey);
        
        // Ma carte en premier (catégorie spéciale)
        if(myProfile) {
            const myCategory = UniverseFan.createFanCategory('👤 Mon Profil', [myProfile], true);
            container.appendChild(myCategory);
        }
        
        // Catégorie Comédiens - plafond d'affichage géré dans createFanCategory (20 + "+X autres")
        if(actors.length > 0) {
            const actorCategory = UniverseFan.createFanCategory('🎭 Comédiens', actors, false);
            container.appendChild(actorCategory);
        }
        
        // Catégorie Techniciens
        if(crew.length > 0) {
            const crewCategory = UniverseFan.createFanCategory('🎥 Techniciens', crew, false);
            container.appendChild(crewCategory);
        }
        
        // Catégorie Associations
        if(associations.length > 0) {
            const assoCategory = UniverseFan.createFanCategory('🤝 Associations', associations, false);
            container.appendChild(assoCategory);
        }
        
        // Catégorie Entreprises
        if(enterprises.length > 0) {
            const entCategory = UniverseFan.createFanCategory('🏢 Entreprises', enterprises, false);
            container.appendChild(entCategory);
        }
        
        // Catégorie Projets
        if(projects.length > 0) {
            const projectCategory = UniverseFan.createFanCategory('🎬 Projets', projects, false);
            container.appendChild(projectCategory);
        }
        
        scene.appendChild(container);
    },
    
    // Crée une catégorie avec grille de cartes
    createFanCategory: (label, items, isMyProfile) => {
        const category = document.createElement('div');
        category.className = 'fan-category';
        
        // Header avec label et compteur
        const header = document.createElement('div');
        header.className = 'fan-category-header';
        const labelEl = document.createElement('span');
        labelEl.className = 'fan-category-label';
        labelEl.innerHTML = label;
        header.appendChild(labelEl);
        
        if(items.length > 0) {
            const countEl = document.createElement('span');
            countEl.className = 'fan-category-count';
            countEl.textContent = `${items.length} résultat${items.length > 1 ? 's' : ''}`;
            header.appendChild(countEl);
        }
        category.appendChild(header);
        
        if(items.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'text-align: center; color: var(--text-sec); padding: 40px;';
            emptyMsg.textContent = 'Aucun résultat';
            category.appendChild(emptyMsg);
            return category;
        }
        
        // Grille de cartes
        const grid = document.createElement('div');
        grid.className = 'fan-grid';
        
        // Afficher toutes les cartes (max 20)
        const maxCards = Math.min(items.length, 20);
        
        items.slice(0, maxCards).forEach((item) => {
            const card = UniverseFan.createFanCard(item, isMyProfile);
            grid.appendChild(card);
        });
        
        // Message si plus de résultats
        if(items.length > maxCards) {
            const moreMsg = document.createElement('div');
            moreMsg.style.cssText = 'text-align: center; color: var(--text-sec); padding: 15px; width: 100%;';
            moreMsg.textContent = `+ ${items.length - maxCards} autres résultats. Affinez votre recherche.`;
            grid.appendChild(moreMsg);
        }
        
        category.appendChild(grid);
        
        return category;
    },
    
    // Crée une carte pour la vue éventail
    createFanCard: (item, isMain) => {
        const card = document.createElement('div');
        const isProject = item.type === 'project';
        
        card.className = 'fan-card' + (isProject ? ' project-card' : '') + (isMain ? ' main-card' : '');
        card.dataset.profileId = item.id;
        
        if(isProject) {
            const photoHtml = item.image 
                ? `<img src="${Utils.safeMediaUrl(item.image)}" alt="${Utils.escape(item.title)}" onerror="this.parentElement.innerHTML='🎬'">`
                : '🎬';
            
            card.innerHTML = `
                <div class="card-photo project-photo">${photoHtml}</div>
                <div class="card-name">${Utils.escape(item.title)}</div>
                <div class="card-role project-type">${item.projectType || 'Projet'}</div>
                ${item.city ? `<div class="card-city">📍 ${Utils.escape(item.city)}</div>` : ''}
            `;
            card.onclick = () => Universe.openProjectModal(item);
        } else {
            // Icône selon le type
            const defaultIcon = item.type === 'actor' ? '🎭' : 
                               item.type === 'crew' ? '🎥' : 
                               item.type === 'association' ? '🏛️' : 
                               item.type === 'enterprise' ? '🏢' : '👤';
            
            const photoHtml = item.photo 
                ? `<img src="${Utils.safeMediaUrl(item.photo)}" alt="${Utils.escape(item.name)}" onerror="this.parentElement.innerHTML='${defaultIcon}'">`
                : defaultIcon;
            
            // Rôle/description selon le type
            let role = '';
            if(item.type === 'actor') {
                role = item.gender === 'homme' ? 'Comédien' : item.gender === 'femme' ? 'Comédienne' : 'Comédien·ne';
            } else if(item.type === 'crew') {
                role = item.role || item.department || 'Technicien·ne';
            } else if(item.type === 'association') {
                const assoType = CONFIG.associationTypes.find(t => t.id === item.assoType);
                role = assoType ? assoType.name : 'Association';
            } else if(item.type === 'enterprise') {
                const entType = CONFIG.enterpriseTypes.find(t => t.id === item.entType);
                role = entType ? entType.name : 'Entreprise';
            }
            
            // Message si adresse approximative
            const approxMsg = item._hasApproximateLocation ? 
                `<div class="card-approx-location" style="font-size: 0.7rem; color: var(--text-sec); background: var(--bg); padding: 4px 6px; border-radius: 4px; margin-top: 4px;">📍 Position approximative</div>` : '';
            
            card.innerHTML = `
                <div class="card-photo">${photoHtml}</div>
                <div class="card-name">${Utils.escape(item.name)}</div>
                <div class="card-role">${Utils.escape(role)}</div>
                ${item.city ? `<div class="card-city">📍 ${Utils.escape(item.city)}</div>` : ''}
                ${approxMsg}
            `;
            card.onclick = () => Universe.openProfileModal(item);
            card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
            card.oncontextmenu = (e) => { e.preventDefault(); UniverseFan.showCardMenu(e, item); };
        }
        
        return card;
    },

    // ----- Menu clic droit d'une carte de profil (eventail) -----
    // « Ajouter a l'idee » (planche du personnage d'ou part le casting) et
    // « Ajouter au projet » (invitation, comme le bouton de la fiche profil).
    hideCardMenu: () => { const m = document.getElementById('fan-card-menu'); if(m) m.remove(); },
    showCardMenu: (ev, item) => {
        UniverseFan.hideCardMenu();
        const castingId = (typeof GlobalSearch !== 'undefined') ? GlobalSearch._castingCharId : null;
        const menu = document.createElement('div');
        menu.id = 'fan-card-menu';
        let left = ev.clientX, top = ev.clientY;
        if(left + 230 > window.innerWidth) left = window.innerWidth - 240;
        if(top + 130 > window.innerHeight) top = window.innerHeight - 140;
        if(left < 10) left = 10;
        if(top < 10) top = 10;
        menu.style.cssText = 'position:fixed; top:' + top + 'px; left:' + left + 'px; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); z-index:var(--z-tooltip); min-width:210px; overflow:hidden;';
        let html = '<div style="padding:10px 15px; border-bottom:1px solid var(--border); font-weight:600; color:var(--text-sec); font-size:0.85rem;">' + Utils.escape(String(item.name || item.title || 'Profil').substring(0, 26)) + '</div>';
        if(castingId) html += '<div class="context-menu-item" data-act="idea" style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px;"><span>💡</span> Ajouter à l\'idée</div>';
        html += '<div class="context-menu-item" data-act="project" style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px;"><span>➕</span> Ajouter au projet</div>';
        menu.innerHTML = html;
        menu.querySelectorAll('.context-menu-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const act = el.dataset.act;
                UniverseFan.hideCardMenu();
                if(act === 'idea' && castingId && typeof Board !== 'undefined') {
                    Board.addProfileIdea(castingId, item);
                } else if(act === 'project') {
                    Universe.currentProfile = item;
                    if(typeof UniverseProfileModal !== 'undefined' && UniverseProfileModal.addToProject) UniverseProfileModal.addToProject();
                }
            });
        });
        document.body.appendChild(menu);
        setTimeout(() => { document.addEventListener('click', UniverseFan.hideCardMenu, { once: true }); }, 10);
    },

    // Crée une carte flottante (profil ou projet)
    // UniverseFan.createCard (item, isMain) retirée v569 : orpheline en
    // cascade depuis le retrait de sa façade Universe (étape 3). Le rendu
    // réel des cartes du système solaire passe ailleurs, ce doublon n'était
    // plus branché.
};
