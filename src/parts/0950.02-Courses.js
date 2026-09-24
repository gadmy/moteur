
// ==================== MODULE HELP ====================
const Courses = {
    currentTab: 'scenario',
    
    open: () => {
        UI.hideAllViews();
        document.getElementById('courses-view').classList.add('active');
        const s = document.getElementById('courses-search');
        if(s && !s._lie) {
            s._lie = true;
            s.addEventListener('input', () => Courses.onSearch(s.value));
            // Echap vide la recherche et rend le chapitre.
            s.addEventListener('keydown', (e) => { if(e.key === 'Escape') { s.value = ''; Courses.doSearch(''); } });
        }
        if(s) s.value = '';
        Courses.render();
    },
    
    close: () => {
        UI.hideAllViews();
        document.getElementById('dashboard-view').style.display = 'flex';
    },
    
    switchTab: (tabName) => {
        Courses.currentTab = tabName;
        document.querySelectorAll('.courses-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabName));
        const s = document.getElementById('courses-search');
        if(s) s.value = '';
        Courses.render();
    },
    
    render: () => {
        const content = document.getElementById('courses-content');
        const courses = Courses.getCourses();
        content.innerHTML = courses[Courses.currentTab] || '<p>Contenu à venir...</p>';
        content.style.display = '';
        const res = document.getElementById('courses-results');
        if(res) res.innerHTML = '';
        Courses.initNotions();
        Courses.buildToc();
        const main = document.getElementById('courses-main');
        if(main) main.scrollTop = 0;
    },

    // ---- SOMMAIRE DU CHAPITRE ----
    // Construit a partir des titres reels du contenu : rien a maintenir a la
    // main, un chapitre enrichi voit son sommaire suivre tout seul.
    buildToc: () => {
        const toc = document.getElementById('courses-toc');
        const content = document.getElementById('courses-content');
        if(!toc || !content) return;
        const titres = Array.from(content.querySelectorAll('h3'));
        if(titres.length < 3) { toc.innerHTML = ''; Courses._spy(null); return; }
        let html = '<div class="courses-toc-h">Dans ce chapitre</div>';
        titres.forEach((h, i) => {
            const id = 'crs-' + Courses.currentTab + '-' + i;
            h.id = id;
            html += '<a href="#' + id + '" data-i="' + i + '">' + Utils.escape(h.textContent.trim()) + '</a>';
        });
        toc.innerHTML = html;
        toc.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const cible = document.getElementById(a.getAttribute('href').slice(1));
                if(cible) cible.scrollIntoView({ block: 'start' });
            });
        });
        Courses._spy(titres);
    },

    // Marque dans le sommaire la section en cours de lecture.
    _obs: null,
    _spy: (titres) => {
        if(Courses._obs) { Courses._obs.disconnect(); Courses._obs = null; }
        if(!titres || !titres.length || !window.IntersectionObserver) return;
        const main = document.getElementById('courses-main');
        const toc = document.getElementById('courses-toc');
        if(!main || !toc) return;
        const vus = new Set();
        Courses._obs = new IntersectionObserver((entries) => {
            entries.forEach(en => { if(en.isIntersecting) vus.add(en.target.id); else vus.delete(en.target.id); });
            // La section active est la premiere visible dans l'ordre du texte.
            let actif = null;
            for(const h of titres) { if(vus.has(h.id)) { actif = h.id; break; } }
            toc.querySelectorAll('a').forEach(a => a.classList.toggle('here', a.getAttribute('href') === '#' + actif));
        }, { root: main, rootMargin: '0px 0px -70% 0px', threshold: 0 });
        titres.forEach(h => Courses._obs.observe(h));
    },

    // ---- RECHERCHE ----
    // Elle balaie les SEPT chapitres, pas seulement celui qui est ouvert :
    // c'est tout l'interet quand on cherche un mot sans savoir ou il se range.
    _searchTimer: null,
    onSearch: (valeur) => {
        clearTimeout(Courses._searchTimer);
        Courses._searchTimer = setTimeout(() => Courses.doSearch(valeur), 200);
    },
    LABELS: { scenario: 'Scénario', realisation: 'Réalisation', image: 'Image', son: 'Son', montage: 'Montage', production: 'Production', glossaire: 'Glossaire' },
    doSearch: (valeur) => {
        const res = document.getElementById('courses-results');
        const content = document.getElementById('courses-content');
        const toc = document.getElementById('courses-toc');
        if(!res || !content) return;
        const q = (valeur || '').trim().toLowerCase();
        if(q.length < 2) { res.innerHTML = ''; content.style.display = ''; if(toc) toc.style.display = ''; return; }
        content.style.display = 'none';
        if(toc) toc.style.display = 'none';
        const courses = Courses.getCourses();
        const bac = document.createElement('div');
        const trouves = [];
        Object.keys(courses).forEach(onglet => {
            bac.innerHTML = courses[onglet] || '';
            bac.querySelectorAll('h3').forEach((h, i) => {
                // Texte de la section = son titre plus tout ce qui le suit
                // jusqu'au titre suivant.
                let txt = h.textContent;
                let n = h.nextElementSibling;
                while(n && n.tagName !== 'H3' && n.tagName !== 'H2') { txt += ' ' + n.textContent; n = n.nextElementSibling; }
                if(txt.toLowerCase().includes(q)) {
                    const brut = txt.replace(/\s+/g, ' ').trim();
                    const pos = brut.toLowerCase().indexOf(q);
                    trouves.push({
                        onglet: onglet,
                        i: i,
                        titre: h.textContent.trim(),
                        extrait: (pos > 60 ? '…' : '') + brut.slice(Math.max(0, pos - 60), pos + 120) + '…'
                    });
                }
            });
        });
        if(!trouves.length) {
            res.innerHTML = '<p class="courses-res-h">Aucune section ne parle de « ' + Utils.escape(valeur) + ' ». Essayez un mot plus court.</p>';
            return;
        }
        res.innerHTML = '<p class="courses-res-h">' + trouves.length + ' section' + (trouves.length > 1 ? 's' : '') + ' trouvée' + (trouves.length > 1 ? 's' : '') + '</p>' +
            trouves.map(t =>
                '<button class="courses-res" data-onglet="' + t.onglet + '" data-i="' + t.i + '">' +
                    '<strong>' + Utils.escape(t.titre) + '</strong>' +
                    '<span>' + Utils.escape(Courses.LABELS[t.onglet] || t.onglet) + ' — ' + Utils.escape(t.extrait) + '</span>' +
                '</button>'
            ).join('');
        res.querySelectorAll('.courses-res').forEach(b => {
            b.addEventListener('click', () => Courses.goTo(b.getAttribute('data-onglet'), parseInt(b.getAttribute('data-i'), 10)));
        });
    },

    goTo: (onglet, i) => {
        Courses.switchTab(onglet);
        setTimeout(() => {
            const cible = document.getElementById('crs-' + onglet + '-' + i);
            if(cible) cible.scrollIntoView({ block: 'start' });
        }, 40);
    },
    
    // Système d'infobulles pour les notions
    initNotions: () => {
        document.querySelectorAll('.notion').forEach(el => {
            el.addEventListener('mouseenter', Courses.showNotion);
            el.addEventListener('mouseleave', Courses.scheduleHideNotion);
        });
    },
    
    scheduleHideNotion: () => {
        // Délai pour permettre à la souris d'aller sur le tooltip
        Courses.hideTimeout = setTimeout(() => {
            const tooltip = document.querySelector('.notion-tooltip');
            if (tooltip && !tooltip.matches(':hover')) {
                tooltip.remove();
            }
        }, 100);
    },
    
    showNotion: (e) => {
        const key = e.target.getAttribute('data-notion');
        const notion = Courses.notions[key];
        if (!notion) return;
        
        // Supprimer tooltip existant
        const existing = document.querySelector('.notion-tooltip');
        if (existing) existing.remove();
        
        // Créer tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'notion-tooltip';
        tooltip.innerHTML = `
            <div class="notion-tooltip-title">${notion.title}</div>
            <div class="notion-tooltip-content">
                ${notion.description}
                ${notion.image ? `<div class="notion-tooltip-image">${notion.image}</div>` : ''}
                ${notion.example ? `<div class="notion-tooltip-example">🎬 ${notion.example}</div>` : ''}
            </div>
        `;
        document.body.appendChild(tooltip);
        
        // Positionner - d'abord rendre visible pour calculer dimensions
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';
        
        const rect = e.target.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        const margin = 15;
        
        let top = rect.bottom + 10;
        let left = rect.left;
        
        // Ajuster si dépasse à droite
        if (left + tooltipWidth > window.innerWidth - margin) {
            left = window.innerWidth - tooltipWidth - margin;
        }
        // Ajuster si dépasse à gauche
        if (left < margin) {
            left = margin;
        }
        // Ajuster si dépasse en bas - mettre au-dessus
        if (top + tooltipHeight > window.innerHeight - margin) {
            top = rect.top - tooltipHeight - 10;
        }
        // Ajuster si dépasse en haut (après avoir mis au-dessus)
        if (top < margin) {
            top = margin;
        }
        // Si vraiment trop grand, centrer verticalement
        if (tooltipHeight > window.innerHeight - 2 * margin) {
            top = margin;
            tooltip.style.maxHeight = (window.innerHeight - 2 * margin) + 'px';
            tooltip.style.overflowY = 'auto';
        }
        
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.style.visibility = 'visible';
        tooltip.classList.add('visible');
        
        // Garder le tooltip visible quand on le survole
        tooltip.addEventListener('mouseenter', () => {
            if (Courses.hideTimeout) {
                clearTimeout(Courses.hideTimeout);
            }
        });
        tooltip.addEventListener('mouseleave', () => {
            tooltip.remove();
        });
    },
    
    hideTimeout: null,
    
    // Dictionnaire des notions avec descriptions détaillées
    notions: {
        // === VALEURS DE PLAN ===
        'plan-ensemble': {
            title: 'Plan d\'ensemble (PE)',
            description: `<p>Le plan d'ensemble est le plus large des plans cinématographiques. Il embrasse un vaste espace et situe l'action dans son environnement global.</p>
            <p>Ce plan établit la <strong>géographie</strong> d'une scène et donne au spectateur tous les repères spatiaux nécessaires. Il répond aux questions : Où sommes-nous ? Quelle est l'atmosphère du lieu ?</p>
            <p>Souvent utilisé en ouverture de séquence (establishing shot), il permet de "poser le décor" avant de resserrer sur les personnages.</p>`,
            image: `<img src="/images/cours/plan-ensemble.jpeg" alt="Plan d'ensemble" class="w-full-r8">`,
            example: 'L\'ouverture de "Lawrence d\'Arabie" - le désert immense écrase le personnage.'
        },
        'plan-large': {
            title: 'Plan large / Plan de demi-ensemble (PL)',
            description: `<p>Le plan large montre les personnages en pied dans leur environnement, mais avec plus de proximité que le plan d'ensemble.</p>
            <p>Il permet de voir les <strong>interactions entre les personnages</strong> et leur espace, leurs déplacements, leur gestuelle corporelle complète.</p>
            <p>C'est le plan idéal pour les scènes de groupe, les chorégraphies, ou pour montrer un personnage qui entre dans un lieu.</p>`,
            image: `<img src="/images/cours/plan-large.jpeg" alt="Plan large" class="w-full-r8">`,
            example: 'Les duels dans les westerns de Sergio Leone.'
        },
        'plan-moyen': {
            title: 'Plan moyen (PM)',
            description: `<p>Le plan moyen cadre le personnage à mi-cuisse, parfois appelé "plan italien" car très utilisé dans le cinéma néoréaliste italien.</p>
            <p>Il établit un <strong>équilibre</strong> entre le personnage et son environnement. On voit suffisamment le corps pour percevoir la gestuelle, tout en gardant le contexte spatial.</p>
            <p>C'est un plan de transition, souvent utilisé pour les dialogues à plusieurs personnages ou les scènes de mouvement modéré.</p>`,
            image: `<img src="/images/cours/plan-moyen.jpeg" alt="Plan moyen" class="w-full-r8">`,
            example: 'Les scènes de marche et discussion dans les films d\'Aaron Sorkin.'
        },
        'plan-americain': {
            title: 'Plan américain (PA)',
            description: `<p>Le plan américain cadre le personnage à mi-cuisse, juste au-dessus des genoux. Son nom vient des westerns hollywoodiens où il permettait de voir le colt à la ceinture.</p>
            <p>Ce plan offre une <strong>proximité accrue</strong> avec le personnage tout en conservant une partie de sa gestuelle corporelle. Idéal pour les confrontations et les dialogues tendus.</p>
            <p>Il est légèrement plus serré que le plan moyen et crée une présence plus affirmée du personnage dans le cadre.</p>`,
            image: `<img src="/images/cours/plan-americain.jpeg" alt="Plan américain" class="w-full-r8">`,
            example: 'Les face-à-face dans "Le Bon, la Brute et le Truand".'
        },
        'plan-rapproche': {
            title: 'Plan rapproché (PR)',
            description: `<p>Le plan rapproché cadre le personnage à la poitrine ou aux épaules. On distingue parfois le "plan rapproché taille" et le "plan rapproché poitrine".</p>
            <p>Ce plan crée une véritable <strong>intimité</strong> avec le personnage. Les expressions du visage deviennent lisibles, les émotions plus palpables.</p>
            <p>C'est le plan privilégié pour les dialogues intimes, les révélations, les moments d'émotion. Le spectateur entre dans la sphère personnelle du personnage.</p>`,
            image: `<img src="/images/cours/plan-rapproche.jpeg" alt="Plan rapproché" class="w-full-r8">`,
            example: 'Les conversations entre Rick et Ilsa dans "Casablanca".'
        },
        'gros-plan': {
            title: 'Gros plan (GP)',
            description: `<p>Le gros plan isole le visage du personnage ou un objet significatif, remplissant la majeure partie du cadre.</p>
            <p>C'est le plan de l'<strong>émotion pure</strong>. Chaque micro-expression devient visible : un frémissement de paupière, une larme naissante, un sourire esquissé.</p>
            <p>Le gros plan crée une connexion émotionnelle intense avec le spectateur. Il est souvent réservé aux moments clés pour ne pas perdre son impact.</p>`,
            image: `<img src="/images/cours/gros-plan.jpeg" alt="Gros plan" class="w-full-r8">`,
            example: 'Le regard final d\'Antoine Doinel dans "Les 400 Coups".'
        },
        'tres-gros-plan': {
            title: 'Très gros plan / Insert (TGP)',
            description: `<p>Le très gros plan isole un détail : un œil, une bouche, une main, un objet. Il extrait un fragment de réalité pour lui donner une importance capitale.</p>
            <p>Ce plan crée un effet de <strong>loupe dramatique</strong>. Il dirige impérativement l'attention du spectateur vers ce détail et lui confère une signification narrative.</p>
            <p>L'insert sur un objet (lettre, arme, clé) est une variante narrative qui révèle une information cruciale.</p>`,
            image: `<img src="/images/cours/tres-gros-plan.jpeg" alt="Très gros plan" class="w-full-r8">`,
            example: 'L\'œil en ouverture de "Blade Runner" ou la douille dans "Il faut sauver le soldat Ryan".'
        },
        // === ANGLES ===
        'plongee': {
            title: 'Plongée',
            description: `<p>La caméra est placée au-dessus du sujet et regarde vers le bas. Cet angle écrase le personnage, le diminue visuellement.</p>
            <p>La plongée traduit souvent la <strong>vulnérabilité</strong>, la soumission, l'infériorité ou l'écrasement d'un personnage. Elle peut aussi représenter le point de vue d'un personnage dominant.</p>
            <p>Plus l'angle est prononcé, plus l'effet est dramatique. La plongée totale (90°) est parfois appelée "vue de Dieu".</p>`,
            image: `<img src="/images/cours/plongee.jpeg" alt="Plongée" class="w-full-r8">`,
            example: 'Norman Bates vu d\'en haut après le meurtre dans "Psychose".'
        },
        'contre-plongee': {
            title: 'Contre-plongée',
            description: `<p>La caméra est placée en dessous du sujet et regarde vers le haut. Cet angle grandit le personnage, lui confère puissance et autorité.</p>
            <p>La contre-plongée traduit la <strong>domination</strong>, la menace, l'héroïsme ou la supériorité. Elle peut créer un sentiment d'intimidation chez le spectateur.</p>
            <p>C'est l'angle classique pour filmer les figures d'autorité, les monuments, ou les moments de triomphe.</p>`,
            image: `<img src="/images/cours/contre-plongee.jpeg" alt="Contre-plongée" class="w-full-r8">`,
            example: 'Dark Vador dans toutes ses apparitions dans "Star Wars".'
        },
        'dutch-angle': {
            title: 'Dutch Angle (Angle néerlandais)',
            description: `<p>La caméra est inclinée sur son axe, créant un horizon penché. Le monde semble basculer, perdre son équilibre.</p>
            <p>Le dutch angle traduit le <strong>déséquilibre psychologique</strong>, la folie, le malaise, l'étrangeté. Il signale que quelque chose ne va pas.</p>
            <p>Son nom vient d'une déformation de "Deutsch" (allemand), car cette technique était populaire dans l'expressionnisme allemand des années 1920.</p>`,
            image: `<img src="/images/cours/dutch-angle.jpeg" alt="Dutch angle" class="w-full-r8">`,
            example: 'Omniprésent dans "Le Troisième Homme" et les films de Tim Burton.'
        },
        // === MOUVEMENTS ===
        'panoramique': {
            title: 'Panoramique',
            description: `<p>La caméra pivote sur son axe (horizontal ou vertical) sans se déplacer. Elle "balaie" l'espace comme une tête qui tourne.</p>
            <p>Le panoramique permet d'<strong>explorer un espace</strong>, de suivre un personnage en mouvement, ou de relier deux éléments dans le même plan.</p>
            <p>On distingue le panoramique horizontal (gauche-droite), vertical (haut-bas), et le panoramique filé (très rapide, créant un flou).</p>`,
            image: `<img src="/images/cours/panoramique.jpeg" alt="Panoramique" class="w-full-r8">`,
            example: 'Les panoramiques contemplatifs sur les paysages dans les films de Terrence Malick.'
        },
        'travelling': {
            title: 'Travelling',
            description: `<p>La caméra se déplace physiquement dans l'espace, généralement sur des rails, un chariot, ou tout autre support mobile.</p>
            <p>Le travelling crée une <strong>immersion dynamique</strong>. Il peut accompagner un personnage (travelling d'accompagnement), s'en approcher (travelling avant) ou s'en éloigner (travelling arrière).</p>
            <p>Le travelling latéral est particulièrement efficace pour les scènes de dialogue en marche ou pour révéler progressivement un décor.</p>`,
            image: `<img src="/images/cours/travelling.jpeg" alt="Travelling" class="w-full-r8">`,
            example: 'Le travelling arrière infini dans "Les Affranchis" (scène du Copacabana).'
        },
        'steadicam': {
            title: 'Steadicam',
            description: `<p>Système de stabilisation porté par l'opérateur, permettant des mouvements fluides et libres impossibles sur rails.</p>
            <p>Le Steadicam offre une <strong>fluidité onirique</strong> tout en permettant de suivre les acteurs dans des espaces complexes (escaliers, foules, couloirs).</p>
            <p>Inventé par Garrett Brown en 1975, il a révolutionné le cinéma en permettant des plans-séquences mobiles d'une fluidité inédite.</p>`,
            image: `<img src="/images/cours/steadicam.jpeg" alt="Steadicam" class="w-full-r8">`,
            example: 'La poursuite dans les couloirs de l\'Overlook Hotel dans "Shining".'
        },
        'zoom': {
            title: 'Zoom',
            description: `<p>Changement de focale optique qui rapproche ou éloigne le sujet sans déplacer la caméra. Contrairement au travelling, il modifie la perspective.</p>
            <p>Le zoom est souvent considéré comme moins "cinématographique" que le travelling car il <strong>aplatit l'image</strong>. Mais utilisé intentionnellement, il peut créer des effets puissants.</p>
            <p>Le zoom rapide était caractéristique des années 70 (films de kung-fu, gialli italiens). Il connaît un renouveau ironique ou stylistique.</p>`,
            image: `<img src="/images/cours/zoom.jpeg" alt="Zoom" class="w-full-r8">`,
            example: 'Les zooms brutaux de Quentin Tarantino en hommage aux films d\'exploitation.'
        },
        'vertigo-effect': {
            title: 'Effet Vertigo (Dolly Zoom)',
            description: `<p>Combinaison d'un travelling et d'un zoom en sens inverse. La caméra avance pendant que l'objectif dézoome (ou l'inverse).</p>
            <p>Le sujet garde la même taille mais le fond semble s'étirer ou se comprimer, créant un effet de <strong>vertige et de dissociation</strong>.</p>
            <p>Inventé par Irmin Roberts pour "Vertigo" d'Hitchcock (1958), il traduit visuellement le malaise, la prise de conscience brutale, ou le choc émotionnel.</p>`,
            image: `<img src="/images/cours/vertigo-effect.jpeg" alt="Effet Vertigo" class="w-full-r8">`,
            example: 'La scène du clocher dans "Vertigo" et la plage dans "Les Dents de la Mer".'
        },
        // === IMAGE - COMPOSITION ===
        'regle-tiers': {
            title: 'Règle des tiers',
            description: `<p>Principe de composition divisant l'image en 9 zones égales par 2 lignes horizontales et 2 verticales.</p>
            <p>Les éléments importants (visage, horizon, sujet principal) gagnent en <strong>dynamisme</strong> lorsqu'ils sont placés sur ces lignes ou à leurs intersections, appelées "points forts".</p>
            <p>Centrer le sujet crée une image statique ; le décentrer selon la règle des tiers crée tension et mouvement.</p>`,
            image: `<img src="/images/cours/regle-tiers.jpeg" alt="Règle des tiers" class="w-full-r8">`,
            example: 'Quasi tous les grands directeurs photo utilisent cette règle comme base.'
        },
        'profondeur-champ': {
            title: 'Profondeur de champ',
            description: `<p>Zone de netteté devant et derrière le point de mise au point. Peut être courte (flou d'arrière-plan) ou grande (tout net).</p>
            <p>Une <strong>faible profondeur</strong> isole le sujet et crée de l'intimité. Une <strong>grande profondeur</strong> permet de voir tous les plans simultanément.</p>
            <p>Contrôlée par l'ouverture (f/1.4 = faible, f/16 = grande), la focale et la distance au sujet.</p>`,
            image: `<img src="/images/cours/profondeur-champ.jpeg" alt="Profondeur de champ" class="w-full-r8">`,
            example: 'Wong Kar-wai utilise une très faible profondeur pour créer l intimité.'
        },
        'key-light': {
            title: 'Key Light (Lumière principale)',
            description: `<p>Source lumineuse principale qui définit la direction et la qualité de l'éclairage d'une scène.</p>
            <p>C'est elle qui crée les <strong>ombres principales</strong> et donne le "caractère" à l'image. Sa position détermine le modelé du visage.</p>
            <p>Généralement placée à 45° du sujet (horizontalement et verticalement), mais peut varier selon l'effet recherché.</p>`,
            image: `<img src="/images/cours/key-light.jpeg" alt="Key Light" class="w-full-r8">`,
            example: 'Position classique "Rembrandt" à 45° pour les portraits.'
        },
        'fill-light': {
            title: 'Fill Light (Lumière de remplissage)',
            description: `<p>Source secondaire qui adoucit les ombres créées par la Key Light, sans les éliminer complètement.</p>
            <p>Contrôle le <strong>ratio de contraste</strong> : plus elle est forte, plus l'image est douce. Absente, les ombres sont noires (low-key).</p>
            <p>Souvent placée du côté opposé à la Key, peut être un réflecteur plutôt qu'une vraie source.</p>`,
            image: `<img src="/images/cours/fill-light.jpeg" alt="Fill Light" class="w-full-r8">`,
            example: 'Un ratio Key:Fill de 2:1 donne un look naturel.'
        },
        'back-light': {
            title: 'Back Light (Contre-jour)',
            description: `<p>Lumière placée derrière le sujet qui crée un liseré lumineux sur les contours, séparant le sujet du fond.</p>
            <p>Apporte <strong>profondeur et relief</strong> à l'image. Sans elle, le sujet peut se "fondre" dans l'arrière-plan.</p>
            <p>Aussi appelée "rim light" ou "hair light" quand elle éclaire spécifiquement les cheveux.</p>`,
            image: `<img src="/images/cours/back-light.jpeg" alt="Back Light" class="w-full-r8">`,
            example: 'Indispensable dans les interviews pour décoller le sujet du fond.'
        },
        'high-key': {
            title: 'Éclairage High-Key',
            description: `<p>Style d'éclairage uniforme et lumineux avec très peu d'ombres. L'image est globalement claire.</p>
            <p>Crée une atmosphère <strong>légère, optimiste, accessible</strong>. Associé aux comédies, sitcoms, publicités, clips pop.</p>
            <p>Nécessite beaucoup de fill light pour éliminer les ombres. Ratio Key:Fill proche de 1:1.</p>`,
            image: `<img src="/images/cours/high-key.jpeg" alt="High-Key" class="w-full-r8">`,
            example: 'Les comédies romantiques, les pubs de cosmétiques.'
        },
        'low-key': {
            title: 'Éclairage Low-Key',
            description: `<p>Style d'éclairage contrasté avec des ombres profondes et des zones sombres dominantes.</p>
            <p>Crée une atmosphère <strong>dramatique, mystérieuse, menaçante</strong>. Signature du film noir, thriller, horreur.</p>
            <p>Peu ou pas de fill light. Les ombres sont noires, les sources souvent hors-champ.</p>`,
            image: `<img src="/images/cours/low-key.jpeg" alt="Low-Key" class="w-full-r8">`,
            example: 'Film noir, Se7en, Blade Runner, Le Parrain.'
        },
        'magic-hour': {
            title: 'Magic Hour (Heure dorée)',
            description: `<p>Période juste après le lever ou avant le coucher du soleil où la lumière est dorée, douce et directionnelle.</p>
            <p>Produit une lumière <strong>naturellement flatteuse</strong> avec des ombres longues et une qualité "magique" impossible à reproduire artificiellement.</p>
            <p>Fenêtre de tournage très courte (20-40 min). Demande une préparation minutieuse.</p>`,
            image: `<img src="/images/cours/magic-hour.jpeg" alt="Magic Hour" class="w-full-r8">`,
            example: 'Terrence Malick (Days of Heaven, The Tree of Life) tourne quasi exclusivement en magic hour.'
        },
        // === IMAGE - OPTIQUES ===
        'focale-courte': {
            title: 'Focale courte (Grand-angle)',
            description: `<p>Objectif de 16-35mm qui offre un champ de vision large et exagère les perspectives.</p>
            <p>Les objets proches paraissent <strong>plus grands</strong>, les distances semblent <strong>étirées</strong>. Déforme les bords de l'image.</p>
            <p>Idéal pour : espaces confinés, sentiment d'oppression, immensité des paysages, effets comiques (visage déformé).</p>`,
            image: `<img src="/images/cours/focale-courte.jpeg" alt="Focale courte" class="w-full-r8">`,
            example: 'Kubrick dans Orange Mécanique, les scènes de poursuite de Mad Max.'
        },
        'focale-longue': {
            title: 'Focale longue (Téléobjectif)',
            description: `<p>Objectif de 85-200mm+ qui compresse les distances et isole le sujet avec un fort flou d'arrière-plan.</p>
            <p>Les plans semblent <strong>rapprochés</strong> les uns des autres. Crée une sensation d'<strong>intimité</strong> ou d'<strong>écrasement</strong>.</p>
            <p>Idéal pour : portraits, isoler un sujet dans une foule, créer une sensation de surveillance ou filature.</p>`,
            image: `<img src="/images/cours/focale-longue.jpeg" alt="Focale longue" class="w-full-r8">`,
            example: 'Les portraits de Gordon Willis dans Le Parrain.'
        },
        'anamorphique': {
            title: 'Objectif anamorphique',
            description: `<p>Optique spéciale qui compresse l'image horizontalement à la prise de vue, puis l'étire à la projection.</p>
            <p>Produit le format <strong>CinemaScope 2.39:1</strong>, des flares horizontaux caractéristiques et un bokeh ovale.</p>
            <p>Considéré comme le "look cinéma" par excellence. Plus coûteux et complexe à utiliser.</p>`,
            image: `<img src="/images/cours/anamorphique.jpeg" alt="Anamorphique" class="w-full-r8">`,
            example: 'Blade Runner 2049, Star Wars, La La Land.'
        },
        // === IMAGE - RATIOS ===
        'grue-jib': {
            title: 'Grue / Jib',
            description: `<p>Dispositif mécanique permettant des mouvements de caméra verticaux amples et fluides.</p>
            <p>La <strong>grue</strong> peut porter l'opérateur, le <strong>jib</strong> est télécommandé. Permet des mouvements impossibles autrement.</p>
            <p>Idéal pour les révélations spectaculaires, les survols, les mouvements du sol au ciel.</p>`,
            image: `<img src="/images/cours/grue-jib.jpeg" alt="Grue / Jib" class="w-full-r8">`,
            example: 'Le plan final de La Haine, les survols de foule.'
        },
        'chiaroscuro': {
            title: 'Chiaroscuro (Clair-obscur)',
            description: `<p>Technique d'éclairage inspirée de la peinture baroque (Caravage, Rembrandt) utilisant des contrastes extrêmes.</p>
            <p>Des zones de <strong>lumière intense</strong> côtoient des <strong>ombres profondes</strong>, créant un effet dramatique et sculptural.</p>
            <p>Renforce le mystère, la tension, la dimension psychologique des personnages.</p>`,
            image: `<img src="/images/cours/chiaroscuro.jpeg" alt="Chiaroscuro" class="w-full-r8">`,
            example: 'Le Parrain, Blade Runner, les films de Fincher.'
        },
        'rembrandt-lighting': {
            title: 'Éclairage Rembrandt',
            description: `<p>Technique de portrait où la lumière crée un triangle lumineux sous l'œil du côté ombré du visage.</p>
            <p>Nommé d'après le peintre qui utilisait ce motif. Considéré comme l'<strong>éclairage portrait classique</strong> par excellence.</p>
            <p>La key light est placée à 45° en hauteur et sur le côté, créant ce triangle caractéristique.</p>`,
            image: `<img src="/images/cours/rembrandt-lighting.jpeg" alt="Éclairage Rembrandt" class="w-full-r8">`,
            example: 'Portraits classiques, interviews cinéma.'
        },
        'lumiere-pratique': {
            title: 'Lumière pratique',
            description: `<p>Source de lumière visible à l'écran : lampes, bougies, néons, écrans, phares de voiture.</p>
            <p>Justifie la lumière de la scène de manière <strong>diégétique</strong> (dans l'univers du film).</p>
            <p>Souvent renforcée par des sources cachées car les pratiques seules sont rarement suffisantes.</p>`,
            image: `<img src="/images/cours/lumiere-pratique.jpeg" alt="Lumière pratique" class="w-full-r8">`,
            example: 'Barry Lyndon (bougies), Taxi Driver (néons).'
        },
        'temperature-couleur': {
            title: 'Température de couleur',
            description: `<p>Mesure en Kelvin (K) de la teinte d'une source lumineuse, du chaud (orange) au froid (bleu).</p>
            <p><strong>2700-3200K</strong> = tungstène, bougie (chaud). <strong>5500-6500K</strong> = lumière du jour (neutre à froid).</p>
            <p>Mélanger des sources de températures différentes crée des dominantes colorées (voulues ou non).</p>`,
            image: `<img src="/images/cours/temperature-couleur.jpeg" alt="Température de couleur" class="w-full-r8">`,
            example: 'Mélange tungstène/daylight dans les scènes intérieur/fenêtre.'
        },
        'ratio-scope': {
            title: 'Format Scope (2.39:1)',
            description: `<p>Format cinématographique ultra-large, aussi appelé CinemaScope ou Panavision.</p>
            <p>Idéal pour les <strong>paysages épiques</strong>, les westerns, la science-fiction. Permet de composer avec beaucoup d'espace horizontal.</p>
            <p>Peut créer un sentiment d'isolement quand un personnage seul occupe ce format large.</p>`,
            image: `<img src="/images/cours/ratio-scope.jpeg" alt="Format Scope" class="w-full-r8">`,
            example: 'Lawrence d Arabie, Dune, les westerns de Leone.'
        },
        'ratio-185': {
            title: 'Format 1.85:1',
            description: `<p>Format standard du cinéma américain depuis les années 50. Plus large que le 16:9 TV.</p>
            <p>Bon <strong>compromis</strong> entre l'intimité du 4:3 et l'ampleur du Scope. Polyvalent pour tous les genres.</p>
            <p>Souvent appelé "Flat" par opposition au "Scope".</p>`,
            example: 'La majorité des films américains : Spielberg, Nolan (hors IMAX).'
        },
        'ratio-imax': {
            title: 'Format IMAX (1.43:1)',
            description: `<p>Format géant développé pour les écrans IMAX, presque carré, offrant une immersion maximale.</p>
            <p>Utilise des pellicules ou capteurs beaucoup plus grands que le 35mm standard. Résolution et détails exceptionnels.</p>
            <p>Certains films alternent entre IMAX et Scope selon les scènes (Nolan, Villeneuve).</p>`,
            image: `<img src="/images/cours/ratio-imax.jpeg" alt="Format IMAX" class="w-full-r8">`,
            example: 'Dunkirk, Oppenheimer, Interstellar (séquences IMAX).'
        },
        'cadre-ferme': {
            title: 'Cadre fermé',
            description: `<p>Composition où des éléments du décor (portes, fenêtres, barreaux) encadrent et "emprisonnent" le sujet.</p>
            <p>Crée un sentiment d'<strong>oppression, d'enfermement, de piège</strong>. Le personnage semble coincé.</p>
            <p>Contraste avec le cadre ouvert qui suggère la liberté et les possibilités.</p>`,
            image: `<img src="/images/cours/cadre-ferme.jpeg" alt="Cadre fermé" class="w-full-r8">`,
            example: 'Les plans à travers les barreaux dans Le Silence des Agneaux.'
        },
        'cadre-ouvert': {
            title: 'Cadre ouvert',
            description: `<p>Composition où le personnage dispose d'espace pour "sortir" du cadre, suggérant liberté et possibilités.</p>
            <p>Le regard ou le mouvement du personnage indique un <strong>hors-champ accessible</strong>.</p>
            <p>Crée une dynamique, une invitation au mouvement, un sentiment d'ouverture.</p>`,
            image: `<img src="/images/cours/cadre-ouvert.jpeg" alt="Cadre ouvert" class="w-full-r8">`,
            example: 'Plans larges de westerns, fins ouvertes.'
        },
        'log-raw': {
            title: 'LOG / RAW',
            description: `<p>Profils d'enregistrement qui capturent un maximum d'informations pour l'étalonnage en post-production.</p>
            <p><strong>LOG</strong> : image plate et désaturée, préserve les hautes et basses lumières. <strong>RAW</strong> : données brutes du capteur.</p>
            <p>Nécessite un étalonnage obligatoire mais offre une flexibilité créative maximale.</p>`,
            image: `<img src="/images/cours/log-raw.jpeg" alt="LOG / RAW" class="w-full-r8">`,
            example: 'Standard sur toutes les productions cinéma actuelles.'
        },
        'lut': {
            title: 'LUT (Look-Up Table)',
            description: `<p>Fichier de transformation colorimétrique appliquant un "look" prédéfini à l'image.</p>
            <p><strong>LUT technique</strong> : convertit LOG vers un espace standard. <strong>LUT créative</strong> : applique un style (film, vintage, etc.).</p>
            <p>Permet de prévisualiser le rendu final sur le plateau et d'accélérer l'étalonnage.</p>`,
            example: 'Rec709, Cineon, looks "Teal & Orange".'
        },
        'ratio-43': {
            title: 'Format 4:3 (1.33:1)',
            description: `<p>Format "Academy" classique, aussi format de la télévision ancienne. Presque carré.</p>
            <p>Ressenti <strong>intime, rétro, claustrophobe</strong>. Redécouvert par des cinéastes contemporains pour son caractère distinctif.</p>
            <p>Force à des compositions plus verticales, met l'accent sur les visages.</p>`,
            example: 'The Lighthouse, Elephant de Van Sant, First Reformed.'
        },
        // === IMAGE - CADRE NARRATIF ===
        'hors-champ': {
            title: 'Hors-champ',
            description: `<p>Tout ce qui existe dans l'univers du film mais n'est pas visible dans le cadre à un moment donné.</p>
            <p>Outil narratif <strong>puissant</strong> : ce qu'on ne voit pas peut être plus effrayant/intrigant que ce qu'on montre.</p>
            <p>Le regard d'un personnage, un son, une ombre peuvent suggérer une présence hors-champ.</p>`,
            image: `<img src="/images/cours/hors-champ.jpeg" alt="Hors-champ" class="w-full-r8">`,
            example: 'Alien - le monstre reste hors-champ la majorité du film.'
        },
        'amorce': {
            title: 'Amorce',
            description: `<p>Élément (souvent flou) placé au premier plan du cadre, partiellement visible, qui crée de la profondeur.</p>
            <p>Donne une sensation de <strong>voyeurisme</strong>, d'espionnage, ou simplement de profondeur spatiale.</p>
            <p>Souvent une épaule, une tête, un objet. Fréquent dans les champs/contre-champs.</p>`,
            image: `<img src="/images/cours/amorce.jpeg" alt="Amorce" class="w-full-r8">`,
            example: 'Quasi tous les champs/contre-champs utilisent des amorces.'
        },
        'surcadrage': {
            title: 'Surcadrage',
            description: `<p>Technique de composition où un cadre dans l'image (porte, fenêtre, miroir) encadre le sujet.</p>
            <p>Crée une <strong>mise en abyme</strong>, isole le personnage, peut suggérer l'enfermement ou le voyeurisme.</p>
            <p>Très utilisé par John Ford (portes) et Wong Kar-wai (fenêtres, miroirs).</p>`,
            image: `<img src="/images/cours/surcadrage.jpeg" alt="Surcadrage" class="w-full-r8">`,
            example: 'In the Mood for Love, La Prisonnière du désert (plan final).'
        },
        // === SON - MICROPHONES ===
        'micro-canon': {
            title: 'Micro canon (Shotgun)',
            description: `<p>Microphone très directionnel en forme de tube, conçu pour capter le son dans un angle étroit devant lui.</p>
            <p>Idéal pour <strong>isoler une source</strong> (voix d'un acteur) tout en rejetant les sons latéraux et arrière.</p>
            <p>Monté sur une perche tenue par le perchiste, il doit pointer vers la bouche de l'acteur, généralement par-dessus.</p>`,
            example: 'Standard sur tous les plateaux professionnels.'
        },
        'micro-cravate': {
            title: 'Micro cravate (Lavalier)',
            description: `<p>Microphone miniature omnidirectionnel qui se fixe sur le vêtement de l'acteur, près de la poitrine.</p>
            <p>Avantage : <strong>discret et sécurisant</strong> (toujours à distance constante). Inconvénient : risque de frottements, son moins naturel.</p>
            <p>Souvent utilisé en backup du micro perche, ou quand la perche ne peut pas atteindre l'acteur (plan large).</p>`,
            example: 'Indispensable pour les interviews et documentaires.'
        },
        // === SON - COUCHES SONORES ===
        'foley': {
            title: 'Foley (Bruitage)',
            description: `<p>Art de recréer en studio les sons synchrones du quotidien : pas, vêtements, manipulations d'objets.</p>
            <p>Nommé d'après <strong>Jack Foley</strong>, pionnier de la technique à Universal dans les années 1920.</p>
            <p>Le bruiteur (foley artist) regarde l'image et reproduit les sons en temps réel avec des accessoires variés.</p>`,
            example: 'Ben Burtt a créé le son de R2-D2 et le sabre laser.'
        },
        'ambiance-son': {
            title: 'Ambiance sonore (Room Tone)',
            description: `<p>Son continu caractéristique d'un lieu : rumeur de ville, vent, forêt, bourdonnement d'intérieur.</p>
            <p>Indispensable pour <strong>créer l'espace sonore</strong> et assurer la continuité entre les plans d'une même scène.</p>
            <p>On enregistre toujours 1-2 minutes de "silence" de chaque lieu pour avoir de l'ambiance de raccord.</p>`,
            example: 'Le bourdonnement oppressant dans No Country for Old Men.'
        },
        // === SON - DIÉGÈSE ===
        'son-diegetique': {
            title: 'Son diégétique',
            description: `<p>Son dont la source existe dans l'univers du film et que les personnages peuvent entendre.</p>
            <p>Exemples : radio à l'écran, musicien qui joue, dialogue, bruit de pas, klaxon dans la rue.</p>
            <p>Ancre le spectateur dans la <strong>réalité de la fiction</strong> et renforce l'immersion.</p>`,
            example: 'La radio dans le taxi de Travis Bickle (Taxi Driver).'
        },
        'son-extra-diegetique': {
            title: 'Son extra-diégétique',
            description: `<p>Son ajouté au film que les personnages n'entendent pas : musique de score, voix-off narrative.</p>
            <p>S'adresse <strong>directement au spectateur</strong>, guide ses émotions, commente l'action.</p>
            <p>Outil puissant mais son usage excessif peut devenir manipulateur ou envahissant.</p>`,
            example: 'La musique de John Williams dans Star Wars.'
        },
        // === SON - SOUND DESIGN ===
        'worldizing': {
            title: 'Worldizing',
            description: `<p>Technique inventée par Walter Murch consistant à rejouer un son dans un espace réel et le réenregistrer.</p>
            <p>Donne au son les <strong>caractéristiques acoustiques</strong> d'un lieu : réverbération, filtrage, coloration.</p>
            <p>Plus organique que les reverbs numériques car capture la vraie physique du son dans l'espace.</p>`,
            example: 'Utilisé pour les voix radio dans Apocalypse Now.'
        },
        'layering': {
            title: 'Layering (Superposition)',
            description: `<p>Technique de sound design consistant à superposer plusieurs sons pour en créer un nouveau, unique.</p>
            <p>Un son de monstre peut combiner : cri animal, métal, voix humaine ralentie, grondement...</p>
            <p>Permet de créer des sons <strong>inédits et évocateurs</strong> qui n'existent pas dans la réalité.</p>`,
            example: 'Le T-Rex de Jurassic Park = bébé éléphant + alligator + tigre.'
        },
        // === SON - FORMATS ===
        'surround-51': {
            title: '5.1 Surround',
            description: `<p>Format audio standard du cinéma avec 6 canaux : 5 enceintes + 1 caisson de basses (LFE).</p>
            <p>Configuration : Gauche, Centre, Droite (devant) + Surround Gauche, Surround Droite (arrière) + Subwoofer.</p>
            <p>Permet de <strong>placer les sons dans l'espace</strong> autour du spectateur pour une immersion totale.</p>`,
            example: 'Standard depuis Toy Story (1995) et Saving Private Ryan.'
        },
        'meta-diegetique': {
            title: 'Son méta-diégétique',
            description: `<p>Son subjectif représentant l'intériorité d'un personnage : pensées, souvenirs, hallucinations.</p>
            <p>Le personnage l'entend mais pas les autres : <strong>acouphène, battement de cœur, voix intérieure, flashback sonore</strong>.</p>
            <p>Permet d'accéder à la psychologie du personnage de manière immersive.</p>`,
            example: 'L acouphène après l explosion dans Saving Private Ryan.'
        },
        'wild-tracks': {
            title: 'Wild Tracks',
            description: `<p>Enregistrements sonores réalisés sans image, captant ambiances, effets ou dialogues séparément.</p>
            <p>Permet de <strong>compléter la bande-son</strong> en post-production avec des sons propres et isolés.</p>
            <p>L'ingénieur du son profite des pauses pour enregistrer l'ambiance du lieu, des sons spécifiques.</p>`,
            example: 'Ambiances de rue, bruits de machines, room tone.'
        },
        'pitch-shifting': {
            title: 'Pitch Shifting',
            description: `<p>Modification de la hauteur (fréquence) d'un son sans changer sa durée, ou inversement.</p>
            <p>Ralentir un son le rend plus <strong>grave et menaçant</strong>. L'accélérer le rend aigu et énergique.</p>
            <p>Technique fondamentale du sound design pour créer des sons de créatures, monstres, vaisseaux.</p>`,
            example: 'Le T-Rex (bébé éléphant ralenti), Godzilla.'
        },
        'leitmotiv-sonore': {
            title: 'Leitmotiv sonore',
            description: `<p>Son ou motif musical récurrent associé à un personnage, un lieu, une émotion ou un thème.</p>
            <p>Crée une <strong>association pavlovienne</strong> : le spectateur reconnaît le motif et anticipe.</p>
            <p>Peut être subtil (texture, fréquence) ou évident (thème musical complet).</p>`,
            example: 'La Marche Impériale (Vader), le thème des Dents de la Mer.'
        },
        'micro-omni': {
            title: 'Micro omnidirectionnel',
            description: `<p>Microphone captant le son de manière égale dans toutes les directions (360°).</p>
            <p>Idéal pour les <strong>ambiances</strong>, les enregistrements d'ensemble, ou quand la direction change constamment.</p>
            <p>Moins sensible aux bruits de manipulation mais capte aussi les sons indésirables environnants.</p>`,
            example: 'Enregistrement d ambiances, micros cravate.'
        },
        'double-systeme': {
            title: 'Double système',
            description: `<p>Enregistrement du son sur un appareil séparé de la caméra (enregistreur externe type Sound Devices).</p>
            <p>Qualité <strong>professionnelle supérieure</strong> aux préamplis intégrés des caméras. Standard sur les tournages pro.</p>
            <p>Nécessite une synchronisation en post (clap, timecode). Le son caméra sert de référence.</p>`,
            example: 'Standard sur tous les tournages cinéma.'
        },
        'ducking': {
            title: 'Ducking',
            description: `<p>Technique de mixage où un signal audio baisse automatiquement quand un autre est présent.</p>
            <p>Usage classique : la <strong>musique baisse sous les dialogues</strong> puis remonte quand ils s'arrêtent.</p>
            <p>Peut être fait manuellement ou via un compresseur side-chain en temps réel.</p>`,
            example: 'Toutes les scènes dialogue + musique au cinéma.'
        },
        'stems': {
            title: 'Stems (Prémix)',
            description: `<p>Groupes de pistes audio séparés par catégorie : Dialogues (DX), Musique (MX), Effets (FX).</p>
            <p>Permet de créer des <strong>versions internationales</strong> (VI) en remplaçant uniquement les dialogues.</p>
            <p>Livrables essentiels pour la distribution : le mixage final peut être reconstitué depuis les stems.</p>`,
            example: 'Livrable obligatoire pour toute distribution internationale.'
        },
        'dolby-atmos': {
            title: 'Dolby Atmos',
            description: `<p>Format audio immersif basé sur des "objets sonores" positionnables en 3D, incluant le plafond.</p>
            <p>Contrairement au 5.1/7.1 basé sur des canaux, Atmos place chaque son précisément dans l'espace <strong>x, y, z</strong>.</p>
            <p>Permet des effets de survol, de pluie tombant du plafond, de son qui se déplace avec précision.</p>`,
            example: 'Gravity, Blade Runner 2049, Dune.'
        },
        // === MONTAGE - RACCORDS ===
        'raccord-regard': {
            title: 'Raccord regard',
            description: `<p>Technique de montage où l'on montre d'abord un personnage qui regarde, puis ce qu'il voit.</p>
            <p>Crée un lien <strong>psychologique</strong> entre le spectateur et le personnage : on partage son point de vue.</p>
            <p>Le regard doit être cohérent en direction : s'il regarde à droite, l'objet doit "venir" de la gauche.</p>`,
            example: 'Hitchcock était maître du raccord regard (Fenêtre sur cour).'
        },
        'match-cut': {
            title: 'Match Cut',
            description: `<p>Raccord qui relie deux plans par une similarité visuelle : forme, mouvement, couleur ou composition.</p>
            <p>Crée une <strong>transition poétique</strong> et peut suggérer un lien thématique entre deux éléments distincts.</p>
            <p>Souvent utilisé pour les ellipses temporelles ou les associations d'idées.</p>`,
            example: '2001 de Kubrick : l os préhistorique → station spatiale.'
        },
        'jump-cut': {
            title: 'Jump Cut',
            description: `<p>Coupe entre deux plans très similaires du même sujet, créant un "saut" visuel perturbant.</p>
            <p>Traditionnellement considéré comme une <strong>erreur</strong>, il est devenu un outil stylistique depuis la Nouvelle Vague.</p>
            <p>Exprime l'urgence, le passage du temps, l'instabilité mentale, ou brise volontairement l'illusion.</p>`,
            example: 'Godard dans À bout de souffle - révolution stylistique.'
        },
        'champ-contrechamp': {
            title: 'Champ / Contre-champ',
            description: `<p>Alternance entre deux points de vue opposés, typiquement lors d'un dialogue entre deux personnages.</p>
            <p>Technique <strong>fondamentale</strong> du cinéma narratif. Chaque personnage est filmé séparément regardant vers l'autre.</p>
            <p>Doit respecter la règle des 180° pour maintenir la cohérence spatiale.</p>`,
            example: 'Présent dans 90% des scènes de dialogue au cinéma.'
        },
        // === MONTAGE - THÉORIES ===
        'effet-koulechov': {
            title: 'Effet Koulechov',
            description: `<p>Expérience de Lev Koulechov (années 1920) prouvant que le sens naît du montage, pas des plans isolés.</p>
            <p>Un même visage neutre juxtaposé à différentes images (soupe, cercueil, enfant) est perçu comme exprimant faim, tristesse ou tendresse.</p>
            <p>Démontre que le spectateur <strong>crée le sens</strong> en connectant mentalement les plans.</p>`,
            example: 'Fondement du cinéma soviétique (Eisenstein, Poudovkine).'
        },
        'montage-parallele': {
            title: 'Montage parallèle (Cross-cutting)',
            description: `<p>Alternance entre deux ou plusieurs actions se déroulant simultanément dans des lieux différents.</p>
            <p>Crée la <strong>tension</strong> (course contre la montre), la <strong>comparaison</strong> (riches vs pauvres) ou le <strong>suspense</strong>.</p>
            <p>Inventé par D.W. Griffith, c'est devenu un outil narratif fondamental.</p>`,
            example: 'Le Parrain : baptême + assassinats. Inception : rêves imbriqués.'
        },
        // === MONTAGE - TECHNIQUES ===
        'ellipse': {
            title: 'Ellipse',
            description: `<p>Saut temporel entre deux plans, omettant une partie de l'action jugée non essentielle.</p>
            <p>Permet l'<strong>économie narrative</strong> : on ne montre pas le trajet, la nuit de sommeil, les années qui passent.</p>
            <p>L'ellipse peut être de quelques secondes (sauter une action banale) ou de plusieurs années.</p>`,
            example: '2001 : l os lancé en l air → station spatiale (millions d années).'
        },
        'l-cut-j-cut': {
            title: 'L-Cut / J-Cut',
            description: `<p>Techniques où le son et l'image ne coupent pas au même moment, créant un chevauchement.</p>
            <p><strong>L-Cut</strong> : l'image change mais le son du plan précédent continue. <strong>J-Cut</strong> : le son du plan suivant commence avant l'image.</p>
            <p>Fluidifie les transitions et crée de l'anticipation ou de la continuité émotionnelle.</p>`,
            example: 'Omniprésent dans les dialogues de films modernes.'
        },
        // === MONTAGE - WORKFLOW ===
        'picture-lock': {
            title: 'Picture Lock',
            description: `<p>Moment où le montage image est définitivement validé. Plus aucune modification de durée ou d'ordre des plans.</p>
            <p>Étape <strong>cruciale</strong> car elle déclenche la post-production lourde : étalonnage, VFX, mixage son.</p>
            <p>Après le picture lock, tout changement coûte très cher car il impacte tous les départements.</p>`,
            example: 'Modifier après picture lock peut coûter des milliers d euros.'
        },
        'etalonnage': {
            title: 'Étalonnage (Color Grading)',
            description: `<p>Correction colorimétrique et création du "look" visuel final du film en post-production.</p>
            <p>Deux étapes : <strong>correction primaire</strong> (équilibrer les plans) et <strong>secondaire</strong> (créer l'atmosphère, styliser).</p>
            <p>Peut transformer radicalement l'ambiance : froid/chaud, désaturé, teal & orange, etc.</p>`,
            example: 'Le look orange/teal de Mad Max Fury Road. Le désaturé de Saving Private Ryan.'
        },
        // === SCÉNARIO - STRUCTURE ===
        'structure-3-actes': {
            title: 'Structure en 3 Actes',
            description: `<p>Modèle dramaturgique fondamental divisant le récit en trois parties : Exposition, Confrontation, Résolution.</p>
            <p>Hérité de la <strong>Poétique d'Aristote</strong> (début, milieu, fin), c'est la structure dominante du cinéma narratif classique.</p>
            <p>Proportions classiques : Acte I (25%), Acte II (50%), Acte III (25%).</p>`,
            example: 'Quasi tous les blockbusters suivent ce modèle.'
        },
        'protagoniste': {
            title: 'Protagoniste',
            description: `<p>Personnage principal de l'histoire, celui dont on suit le parcours et à travers lequel le spectateur vit l'aventure.</p>
            <p>Doit avoir un <strong>objectif clair</strong>, des <strong>obstacles</strong> à surmonter et des <strong>enjeux</strong> (ce qu'il risque de perdre).</p>
            <p>Son arc transformationnel (comment il change) est souvent le cœur émotionnel du film.</p>`,
            example: 'Luke Skywalker, Clarice Starling, Woody dans Toy Story.'
        },
        'antagoniste': {
            title: 'Antagoniste',
            description: `<p>Force qui s'oppose au protagoniste et l'empêche d'atteindre son objectif.</p>
            <p>Peut être une <strong>personne</strong> (méchant), une <strong>institution</strong>, la <strong>nature</strong>, la <strong>société</strong> ou le protagoniste <strong>lui-même</strong>.</p>
            <p>Un bon antagoniste croit avoir raison et a ses propres motivations compréhensibles.</p>`,
            example: 'Darth Vader, Hannibal Lecter, le requin dans Les Dents de la Mer.'
        },
        'voyage-heros': {
            title: 'Voyage du Héros',
            description: `<p>Structure narrative universelle en 12 étapes identifiée par Joseph Campbell dans "Le Héros aux mille visages" (1949).</p>
            <p>Décrit le parcours archétypal : départ du monde ordinaire, épreuves dans un monde extraordinaire, retour <strong>transformé</strong>.</p>
            <p>Adapté pour Hollywood par Christopher Vogler, c'est le squelette de nombreux blockbusters.</p>`,
            example: 'Star Wars, Le Seigneur des Anneaux, Matrix, Le Roi Lion.'
        },
        'plot-point': {
            title: 'Plot Point (Point de basculement)',
            description: `<p>Événement majeur qui fait basculer l'histoire dans une nouvelle direction, concept clé du paradigme de Syd Field.</p>
            <p><strong>Plot Point 1</strong> (fin Acte I) : Lance le protagoniste dans l'aventure. <strong>Plot Point 2</strong> (fin Acte II) : Propulse vers le climax.</p>
            <p>Ces moments sont des "portes" : une fois franchies, le protagoniste ne peut plus revenir en arrière.</p>`,
            example: 'Matrix : Neo choisit la pilule rouge (PP1).'
        },
        'midpoint': {
            title: 'Midpoint (Point médian)',
            description: `<p>Moment pivot au centre exact du film (vers la page 60) qui change la dynamique de l'histoire.</p>
            <p>Peut être une <strong>fausse victoire</strong> (tout semble gagné, mais...) ou une <strong>fausse défaite</strong> (tout semble perdu, mais...).</p>
            <p>Souvent le moment où le protagoniste passe de réactif à proactif, ou découvre une vérité importante.</p>`,
            example: 'Titanic : Jack et Rose font l amour (fausse victoire avant le naufrage).'
        },
        'arc-transformationnel': {
            title: 'Arc Transformationnel',
            description: `<p>Évolution intérieure du personnage au cours de l'histoire, sa transformation psychologique ou morale.</p>
            <p>Le personnage commence avec une <strong>croyance limitante</strong> (Lie) née d'une <strong>blessure</strong> (Ghost), et doit découvrir la <strong>vérité</strong> (Truth).</p>
            <p>Ce qu'il VEUT (désir) ≠ ce dont il a BESOIN. Le film réconcilie souvent les deux.</p>`,
            example: 'Scrooge dans A Christmas Carol, Carl dans Là-Haut.'
        },
        // === PRODUCTION - DOCUMENTS ===
        'feuille-service': {
            title: 'Feuille de service',
            description: `<p>Document quotidien distribué la veille à toute l'équipe, détaillant le programme du lendemain.</p>
            <p>Contient : horaires (convocations échelonnées), lieux, scènes tournées, comédiens nécessaires, besoins spéciaux.</p>
            <p>La "bible" de chaque journée. Préparée par le 2ème assistant réalisateur.</p>`,
            example: 'Envoyée chaque soir vers 19h pour le lendemain.'
        },
        'depouillement': {
            title: 'Dépouillement',
            description: `<p>Analyse détaillée du scénario pour lister tous les besoins de chaque scène.</p>
            <p>Répertorie : personnages, figurants, décors, accessoires, costumes, maquillages, véhicules, effets spéciaux...</p>
            <p>Base essentielle pour établir le budget et le plan de travail. Chaque département fait son propre dépouillement.</p>`,
            example: 'Un bon dépouillement évite les mauvaises surprises en tournage.'
        },
        // === PRODUCTION - POSTES ===
        'scripte': {
            title: 'Scripte (Script Supervisor)',
            description: `<p>Garant(e) de la continuité du film : raccords de gestes, positions, accessoires, costumes, maquillage entre les plans.</p>
            <p>Note chaque prise (durée, commentaires, sélection du réalisateur) et rédige le rapport image pour le montage.</p>
            <p>Mémoire vivante du tournage. Travaille en étroite collaboration avec le réalisateur et le monteur.</p>`,
            example: 'Le scripte note tout : verre plein ou vide, main gauche ou droite...'
        },
        'chef-op': {
            title: 'Directeur de la Photographie (Chef Op)',
            description: `<p>Responsable de l'image du film : éclairage, cadrage, choix des optiques, atmosphère visuelle.</p>
            <p>Traduit la vision du réalisateur en lumière. Supervise les équipes caméra et électricité.</p>
            <p>Collaboration créative étroite avec le réalisateur. Peut définir le "look" signature d'un film.</p>`,
            example: 'Roger Deakins (Skyfall, Blade Runner 2049), Emmanuel Lubezki (Gravity).'
        },
        // === PRODUCTION - BUDGET ===
        'above-below-line': {
            title: 'Above / Below the Line',
            description: `<p>Division traditionnelle du budget en deux catégories, séparées par une "ligne" symbolique.</p>
            <p><strong>Above the line</strong> : coûts créatifs (droits, scénario, réalisateur, producteur, acteurs principaux).</p>
            <p><strong>Below the line</strong> : coûts de fabrication (équipe technique, matériel, décors, post-production).</p>`,
            example: 'Un star-système gonflé = Above the line disproportionné.'
        },
        // === RÉALISATION - POINTS DE VUE ===
        'plan-subjectif': {
            title: 'Plan subjectif (POV)',
            description: `<p>La caméra prend la place des yeux d'un personnage. Le spectateur voit exactement ce que le personnage voit.</p>
            <p>Crée une <strong>identification forte</strong> et une immersion totale. Souvent précédé d'un plan sur le personnage qui regarde.</p>
            <p>Peut être troublant si prolongé (vertige, malaise). Utilisé pour les scènes de tension, découverte, poursuite.</p>`,
            example: 'Halloween (Michael Myers), Enter the Void, Strange Days.'
        },
        'plan-objectif': {
            title: 'Plan objectif',
            description: `<p>Point de vue neutre d'un observateur extérieur. La caméra ne représente les yeux d'aucun personnage.</p>
            <p>Position <strong>omnisciente</strong> classique du cinéma narratif. Le spectateur observe la scène comme un témoin invisible.</p>
            <p>Crée une distance analytique, permet de voir ce que les personnages ne voient pas.</p>`,
            example: 'La majorité des plans dans le cinéma classique.'
        },
        'plan-semi-subjectif': {
            title: 'Plan semi-subjectif',
            description: `<p>La caméra est proche d'un personnage, dans son espace, mais ne représente pas exactement ses yeux.</p>
            <p>Souvent <strong>par-dessus l'épaule</strong> (over-the-shoulder). Partage l'expérience sans l'identification totale.</p>
            <p>Compromis entre subjectivité et objectivité. Très utilisé dans les dialogues et scènes d'action.</p>`,
            example: 'Champs/contre-champs avec amorce d épaule.'
        },
        'ligne-180': {
            title: 'Ligne des 180° (Règle)',
            description: `<p>Axe imaginaire entre deux sujets qui ne doit pas être franchi sans transition pour maintenir la cohérence spatiale.</p>
            <p>Si la caméra passe de l'autre côté, les personnages semblent <strong>inverser leurs positions</strong> et le spectateur perd ses repères.</p>
            <p>Peut être franchie volontairement pour créer confusion ou malaise (Kubrick, Ozu).</p>`,
            example: 'Règle fondamentale du découpage classique hollywoodien.'
        },
        'plan-sequence': {
            title: 'Plan-séquence',
            description: `<p>Une scène entière tournée en un seul plan continu, sans aucune coupe de montage.</p>
            <p>Demande une <strong>chorégraphie parfaite</strong> des acteurs, de la caméra et de la technique. Très exigeant mais immersif.</p>
            <p>Crée une tension continue car le spectateur sait qu'il n'y a pas d'échappatoire au temps réel.</p>`,
            image: `<img src="/images/cours/plan-sequence.jpeg" alt="Plan-séquence" class="w-full-r8">`,
            example: 'La Corde (Hitchcock), Birdman, 1917, Copacabana dans Les Affranchis.'
        },
        'blocking': {
            title: 'Blocking (Mise en place)',
            description: `<p>Placement et déplacement des acteurs dans le décor. L'art de raconter l'histoire par les positions et mouvements.</p>
            <p>Un bon blocking <strong>exprime les relations</strong> sans dialogue : distance = froideur, rapprochement = intimité, dos tourné = rejet.</p>
            <p>Le réalisateur "chorégraphie" la scène avant même de placer la caméra.</p>`,
            example: 'David Fincher et ses blocking millimétrés.'
        },
        'staging': {
            title: 'Staging (Mise en cadre)',
            description: `<p>Organisation des éléments visuels dans le cadre pour guider le regard du spectateur.</p>
            <p>Combine <strong>blocking</strong> (acteurs) + <strong>décor</strong> + <strong>lumière</strong> + <strong>profondeur</strong> pour créer une composition signifiante.</p>
            <p>Chaque élément du cadre doit avoir une raison d'être et contribuer à la narration.</p>`,
            example: 'Les compositions géométriques de Wes Anderson.'
        },
        'oner': {
            title: 'Oner (Plan-séquence virtuose)',
            description: `<p>Plan-séquence techniquement complexe, souvent avec mouvements de caméra élaborés et chorégraphie précise.</p>
            <p>Différent du plan-séquence simple par son <strong>ambition technique</strong> et sa durée (parfois plusieurs minutes).</p>
            <p>Peut impliquer grues, steadicam, transitions cachées, coordination de dizaines de figurants.</p>`,
            example: 'Copacabana (Goodfellas), Atonement, 1917, Birdman.'
        },
        'split-focus': {
            title: 'Split Focus (Diopter)',
            description: `<p>Technique optique utilisant une lentille fendue pour avoir deux plans de netteté simultanés.</p>
            <p>Permet de garder nets à la fois un sujet <strong>très proche</strong> et un autre <strong>très éloigné</strong> dans le même plan.</p>
            <p>Signature visuelle de Brian De Palma. Crée une tension entre deux zones d'action.</p>`,
            example: 'Les films de Brian De Palma (Blow Out, Carrie).'
        },
        'camera-epaule': {
            title: 'Caméra épaule (Handheld)',
            description: `<p>Technique où l'opérateur porte la caméra sur l'épaule, créant une image légèrement instable.</p>
            <p>Apporte <strong>urgence, réalisme, immersion documentaire</strong>. Le spectateur ressent la présence physique du filmeur.</p>
            <p>Signature des frères Dardenne, Paul Greengrass. À utiliser avec intention, pas par défaut.</p>`,
            image: `<img src="/images/cours/camera-epaule.jpeg" alt="Caméra épaule" class="w-full-r8">`,
            example: 'La Haine, Bourne Identity, films des Dardenne.'
        },
        'storyboard': {
            title: 'Storyboard',
            description: `<p>Suite de dessins représentant chaque plan du film, comme une bande dessinée du découpage.</p>
            <p>Permet de <strong>visualiser</strong> le film avant le tournage et de communiquer la vision du réalisateur à l'équipe.</p>
            <p>Indispensable pour les scènes complexes (action, VFX). Peut être simple croquis ou très détaillé.</p>`,
            example: 'Hitchcock storyboardait chaque plan. Mad Max Fury Road entièrement dessiné.'
        },
        'reperages': {
            title: 'Repérages (Location Scouting)',
            description: `<p>Recherche et validation des lieux de tournage avant la production.</p>
            <p>Évalue : <strong>esthétique</strong>, lumière naturelle, acoustique, accessibilité, contraintes techniques et légales.</p>
            <p>Le réalisateur, chef op et régisseur visitent ensemble. Photos et vidéos pour préparer le découpage.</p>`,
            example: 'Le Seigneur des Anneaux : 3 ans de repérages en Nouvelle-Zélande.'
        },
        'ligne-30': {
            title: 'Règle des 30°',
            description: `<p>Entre deux plans consécutifs du même sujet, la caméra doit bouger d'au moins 30° pour éviter un jump cut.</p>
            <p>Un changement d'angle insuffisant crée une <strong>saute</strong> visuelle désagréable et désorientante.</p>
            <p>Alternative : changer significativement la valeur de plan (passer de PM à GP par exemple).</p>`,
            example: 'La Nouvelle Vague a volontairement brisé cette règle (À bout de souffle).'
        },
        'headroom': {
            title: 'Headroom (Air au-dessus)',
            description: `<p>Espace entre le haut de la tête du sujet et le bord supérieur du cadre.</p>
            <p><strong>Trop de headroom</strong> = sujet écrasé, perdu. <strong>Pas assez</strong> = sujet étouffé, tête coupée.</p>
            <p>Varie selon la valeur de plan : plus serré = moins de headroom nécessaire.</p>`,
            image: `<img src="/images/cours/headroom.jpeg" alt="Headroom" class="w-full-r8">`,
            example: 'Erreur fréquente des débutants : trop ou pas assez d air.'
        },
        'looking-room': {
            title: 'Looking Room (Regard)',
            description: `<p>Espace laissé devant le regard ou la direction du mouvement d'un sujet.</p>
            <p>Si le personnage regarde à droite, laisser de l'espace à droite. Sinon, il semble <strong>coincé</strong> contre le bord.</p>
            <p>Crée une composition équilibrée et suggère ce que le personnage regarde (hors-champ).</p>`,
            image: `<img src="/images/cours/looking-room.jpeg" alt="Looking Room" class="w-full-r8">`,
            example: 'Règle de base pour les interviews et dialogues.'
        },
        // === SCÉNARIO - ÉLÉMENTS DRAMATIQUES ===
        'enjeu': {
            title: 'Enjeu (Stakes)',
            description: `<p>Ce que le protagoniste risque de <strong>perdre</strong> s'il échoue dans sa quête.</p>
            <p>Plus l'enjeu est élevé (vie, amour, humanité), plus le spectateur est investi émotionnellement.</p>
            <p>Peut être externe (sauver le monde) ou interne (trouver sa place, se pardonner).</p>`,
            example: 'Titanic : l amour et la vie. Le Parrain : l âme de Michael.'
        },
        'conflit': {
            title: 'Conflit',
            description: `<p>Opposition fondamentale qui crée la <strong>tension dramatique</strong> et fait avancer l'histoire.</p>
            <p>Types : Homme vs Homme, Homme vs Nature, Homme vs Société, Homme vs Lui-même, Homme vs Technologie.</p>
            <p>Sans conflit, pas d'histoire. Le conflit révèle le vrai caractère des personnages.</p>`,
            example: 'Les Dents de la Mer : Homme vs Nature. Fight Club : Homme vs Lui-même.'
        },
        // === RÉALISATION - STYLES ===
        'casting': {
            title: 'Casting (Direction de casting)',
            description: `<p>Processus de sélection des comédiens pour les rôles du film.</p>
            <p>Comprend : lecture du scénario, auditions, essais caméra, chemistry reads (alchimie entre acteurs).</p>
            <p>Le directeur de casting propose, le réalisateur et producteur décident. Un bon casting = 90% du travail.</p>`,
            example: 'Heath Ledger choisi pour le Joker malgré les doutes initiaux.'
        },
        'decoupage-classique': {
            title: 'Découpage classique (Hollywood)',
            description: `<p>Méthode de tournage standard : un <strong>master shot</strong> (plan large de toute la scène) + coverage (plans rapprochés).</p>
            <p>Permet un montage fluide et "invisible". Le spectateur ne remarque pas les coupes.</p>
            <p>Sécurité maximale en post-production : toutes les options de montage sont couvertes.</p>`,
            example: 'Standard hollywoodien depuis les années 30.'
        },
        'decoupage-europeen': {
            title: 'Découpage européen',
            description: `<p>Approche privilégiant les <strong>plans longs</strong>, moins de coupes, laissant "respirer" les scènes.</p>
            <p>Fait confiance au jeu des acteurs et à la mise en scène plutôt qu'au montage.</p>
            <p>Moins de coverage, plus de risques, mais authenticité et immersion accrues.</p>`,
            example: 'Bergman, Tarkovski, Haneke, les frères Dardenne.'
        },
        'minimalisme': {
            title: 'Minimalisme cinématographique',
            description: `<p>Économie de moyens : cadres fixes, peu de mouvements, temps réel, peu de musique.</p>
            <p>Laisse l'<strong>espace et le temps</strong> aux spectateurs pour observer et réfléchir.</p>
            <p>Souvent associé au cinéma d'auteur iranien, japonais, ou européen contemplatif.</p>`,
            example: 'Kiarostami, Ozu, Haneke, Tsai Ming-liang.'
        },
        // === IMAGE - OPTIQUES ===
        'focale-normale': {
            title: 'Focale normale (50mm)',
            description: `<p>Objectif dont l'angle de champ est proche de la <strong>vision humaine</strong> (environ 46°).</p>
            <p>Rendu naturel, sans distorsion ni compression. Considérée comme "neutre" et polyvalente.</p>
            <p>La focale de référence, souvent recommandée pour apprendre la composition.</p>`,
            image: `<img src="/images/cours/focale-normale.jpeg" alt="Focale normale" class="w-full-r8">`,
            example: 'Kubrick adorait le 50mm. Idéal pour les portraits naturels.'
        },
        'macro': {
            title: 'Objectif Macro',
            description: `<p>Optique permettant des <strong>très gros plans</strong> sur de petits objets (ratio 1:1 ou plus).</p>
            <p>Révèle des détails invisibles à l'œil nu : textures, insectes, gouttes d'eau, mécanismes.</p>
            <p>Profondeur de champ extrêmement réduite. Demande stabilisation et éclairage précis.</p>`,
            image: `<img src="/images/cours/macro.jpeg" alt="Macro" class="w-full-r8">`,
            example: 'Microcosmos, les inserts de Se7en, Planet Earth.'
        },
        'balance-blancs': {
            title: 'Balance des blancs',
            description: `<p>Réglage de la caméra pour que le <strong>blanc apparaisse neutre</strong> quelle que soit la source lumineuse.</p>
            <p>Compense la température de couleur de la lumière (tungstène = chaud, daylight = froid).</p>
            <p>Peut être réglée manuellement (Kelvin) ou avec des presets (Daylight, Tungsten, Cloudy...).</p>`,
            image: `<img src="/images/cours/white-balance.jpeg" alt="Balance des blancs" class="w-full-r8">`,
            example: 'Erreur fréquente : peau orange en intérieur tungstène.'
        },
        // === SON - COUCHES SONORES ===
        'silence-cinematographique': {
            title: 'Silence (outil dramatique)',
            description: `<p>Absence volontaire de son, utilisée comme <strong>outil narratif puissant</strong>.</p>
            <p>Crée tension, malaise, suspension. Amplifie l'impact du son qui suit.</p>
            <p>Souvent sous-estimé. Le silence avant un moment fort décuple son effet.</p>`,
            example: 'No Country for Old Men, A Quiet Place, 2001 l Odyssée.'
        },
        // === SCÉNARIO - FORMAT ===
        'entete-scene': {
            title: 'En-tête de scène (Slugline)',
            description: `<p>Première ligne de chaque scène indiquant : <strong>INT./EXT.</strong> (intérieur/extérieur) - <strong>LIEU</strong> - <strong>MOMENT</strong> (JOUR/NUIT).</p>
            <p>Exemple : INT. APPARTEMENT DE MARIE - CUISINE - NUIT</p>
            <p>Permet à l'équipe de production de planifier les décors, l'éclairage et le planning. Toujours en MAJUSCULES.</p>`,
            example: 'Standard universel dans tous les scénarios professionnels.'
        },
        'action-scenario': {
            title: 'Action (Description)',
            description: `<p>Paragraphes décrivant ce qu'on <strong>voit et entend</strong> à l'écran. Toujours au présent, style concis et visuel.</p>
            <p>Éviter : pensées des personnages, explications, adverbes inutiles. Écrire uniquement ce que la caméra peut capter.</p>
            <p>Maximum 4 lignes par paragraphe. Aérer pour faciliter la lecture et le rythme.</p>`,
            example: '"Marie entre. Elle pose ses clés. Regarde le répondeur. Trois messages."'
        },
        'dialogue-scenario': {
            title: 'Dialogue',
            description: `<p>Ce que dit le personnage. Précédé du nom du personnage en MAJUSCULES, centré.</p>
            <p>Un bon dialogue : révèle le caractère, fait avancer l'intrigue, semble naturel mais est travaillé.</p>
            <p>Éviter l'exposition maladroite ("Comme tu sais, nous sommes frères depuis 30 ans...").</p>`,
            example: 'Tarantino, Sorkin et Mamet sont maîtres du dialogue mémorable.'
        },
        'didascalie': {
            title: 'Didascalie (Parenthetical)',
            description: `<p>Indication de jeu entre parenthèses, placée entre le nom du personnage et son dialogue.</p>
            <p>Utilisée avec parcimonie pour : ton particulier (ironique), action pendant le dialogue (versant le café), ou destinataire (à Marie).</p>
            <p>Éviter de surcharger : faire confiance aux acteurs et au réalisateur pour l'interprétation.</p>`,
            example: '(murmurant) ou (sans lever les yeux) ou (à lui-même)'
        },
        // === SCÉNARIO - ARC PERSONNAGE ===
        'ghost': {
            title: 'Ghost (Blessure)',
            description: `<p>Trauma ou événement du passé qui <strong>définit les peurs</strong> et comportements actuels du personnage.</p>
            <p>Souvent révélé progressivement. Explique pourquoi le personnage est "cassé" au début de l'histoire.</p>
            <p>Le climax force généralement le personnage à affronter ce Ghost pour évoluer.</p>`,
            example: 'Bruce Wayne et le meurtre de ses parents. Will Hunting et la maltraitance.'
        },
        'lie': {
            title: 'Lie (Croyance limitante)',
            description: `<p>Ce que le personnage <strong>croit à tort</strong> sur lui-même ou le monde, conséquence du Ghost.</p>
            <p>"Je ne mérite pas d'être aimé", "Le monde est cruel", "Je dois tout contrôler pour survivre".</p>
            <p>L'arc transformationnel consiste à déconstruire cette croyance pour la remplacer par la Vérité.</p>`,
            example: 'Carl (Là-haut) croit que s aventurer seul trahit Ellie.'
        },
        'verite-personnage': {
            title: 'Truth (Vérité)',
            description: `<p>Ce que le personnage doit <strong>apprendre</strong> pour compléter son arc et trouver la paix/réussite.</p>
            <p>Opposée à la Lie. Souvent thématiquement liée au message du film.</p>
            <p>Le personnage l'accepte généralement au climax, ce qui lui permet de triompher (ou de tragiquement échouer s'il la refuse).</p>`,
            example: 'Marlin (Nemo) : "Je dois faire confiance à mon fils et le laisser grandir."'
        },
        'besoin-vs-desir': {
            title: 'Besoin vs Désir (Need vs Want)',
            description: `<p><strong>Désir (Want)</strong> : ce que le personnage poursuit consciemment (objectif externe visible).</p>
            <p><strong>Besoin (Need)</strong> : ce dont il a vraiment besoin pour être complet (souvent inconscient, interne).</p>
            <p>Les meilleures histoires créent une tension entre les deux. Le personnage obtient ce dont il a besoin, pas toujours ce qu'il veut.</p>`,
            example: 'Michael Corleone veut protéger sa famille, mais a besoin de ne pas devenir son père.'
        },
        // === RÉALISATION - DIRECTION D'ACTEURS ===
        'stanislavski': {
            title: 'Méthode Stanislavski',
            description: `<p>Système de jeu développé par Constantin Stanislavski, fondement du jeu moderne.</p>
            <p>Principes clés : <strong>mémoire affective</strong> (puiser dans ses émotions vécues), <strong>objectif</strong> (que veut le personnage ?), <strong>circonstances données</strong> (contexte complet).</p>
            <p>Recherche de la "vérité" du personnage plutôt que la simple imitation externe.</p>`,
            example: 'Base de formation de la plupart des écoles de théâtre mondiales.'
        },
        'actors-studio': {
            title: 'Actors Studio (Méthode)',
            description: `<p>École new-yorkaise fondée en 1947, célèbre pour la "Method Acting" de Lee Strasberg.</p>
            <p>Pousse le Stanislavski plus loin : <strong>immersion totale</strong> dans le personnage, parfois pendant des mois hors plateau.</p>
            <p>Critiquée pour ses excès mais a produit des performances iconiques.</p>`,
            example: 'De Niro (Taxi Driver), Day-Lewis, Brando, Pacino, Hoffman.'
        },
        'meisner': {
            title: 'Technique Meisner',
            description: `<p>Méthode développée par Sanford Meisner, axée sur la <strong>réaction instinctive</strong> et l'écoute du partenaire.</p>
            <p>Exercice clé : la répétition. Deux acteurs répètent une phrase en variant selon les réactions de l'autre.</p>
            <p>Moins d'introspection que Stanislavski, plus d'attention à l'instant présent et au partenaire.</p>`,
            example: 'Robert Duvall, Diane Keaton, Grace Kelly, Tom Cruise.'
        },
        'approche-bresson': {
            title: 'Approche Bresson',
            description: `<p>Philosophie radicale de Robert Bresson : utiliser des "modèles" (non-acteurs) plutôt que des acteurs professionnels.</p>
            <p>Répéter chaque prise jusqu'à <strong>épuisement du jeu conscient</strong>. Ce qui reste est authentique, dépouillé.</p>
            <p>Refus de la psychologie, de l'expressivité. Laisser le montage et le contexte créer l'émotion.</p>`,
            example: 'Pickpocket, Au hasard Balthazar, L Argent.'
        },
        'improvisation-dirigee': {
            title: 'Improvisation dirigée',
            description: `<p>Le réalisateur définit un <strong>cadre</strong> (situation, objectifs, enjeux) mais laisse les acteurs improviser le dialogue et les actions.</p>
            <p>Crée une spontanéité et un naturel impossibles à scénariser. Demande des acteurs très préparés et un réalisateur réactif.</p>
            <p>Le scénario final est parfois écrit après le tournage, à partir des rushes.</p>`,
            example: 'Cassavetes, Mike Leigh, Kechiche, les frères Dardenne.'
        },
        // === IMAGE - COMPOSITION ===
        'lignes-directrices': {
            title: 'Lignes directrices (Leading Lines)',
            description: `<p>Éléments visuels naturels (routes, rampes, regards, architecture) qui <strong>guident l'œil du spectateur</strong> vers le sujet principal.</p>
            <p>Peuvent converger vers un point (perspective), encadrer le sujet, ou créer une dynamique de mouvement.</p>
            <p>Outil fondamental de composition pour contrôler où le spectateur regarde dans le cadre.</p>`,
            image: `<img src="/images/cours/lignes-directrices.jpeg" alt="Lignes directrices" class="w-full-r8">`,
            example: 'Les couloirs de Kubrick, les rails dans Il était une fois dans l Ouest.'
        },
        // === SON - AVANCÉ ===
        'trans-diegetique': {
            title: 'Son trans-diégétique',
            description: `<p>Son qui <strong>passe d'un état à l'autre</strong> : de diégétique à extra-diégétique ou inversement.</p>
            <p>Exemple : une musique de film (extra-diégétique) qui devient la radio d'une voiture (diégétique), ou l'inverse.</p>
            <p>Crée des transitions élégantes et joue avec la frontière entre le monde du film et sa narration.</p>`,
            example: 'Apocalypse Now : "The End" passe de la bande-son à la radio de l hélico.'
        },
        'sound-metaphor': {
            title: 'Métaphore sonore',
            description: `<p>Son utilisé pour <strong>représenter une idée, une émotion ou un concept</strong> au-delà de sa source réelle.</p>
            <p>Le battement de cœur = tension/peur. Le tic-tac = temps qui presse. Le vent = solitude ou changement.</p>
            <p>Permet d'exprimer l'intériorité des personnages ou les thèmes du film de manière subtile.</p>`,
            example: 'Le battement de cœur révélateur dans The Tell-Tale Heart (Poe).'
        },
        // === SON - COUCHES ET TECHNIQUES ===
        'dialogues-son': {
            title: 'Dialogues',
            description: `<p>Voix des personnages, élément <strong>le plus important</strong> de la bande-son narrative.</p>
            <p>Doivent toujours être intelligibles sauf choix artistique délibéré. Priorité absolue lors de l'enregistrement et du mixage.</p>
            <p>Enregistrés sur le plateau (son direct) et/ou en post-synchronisation (ADR/doublage).</p>`,
            example: 'Un dialogue inaudible = spectateur perdu. Toujours protéger les voix.'
        },
        'musique-film': {
            title: 'Musique de film (Score)',
            description: `<p>Composition originale ou morceaux existants accompagnant l'image pour renforcer l'émotion.</p>
            <p><strong>Score</strong> = musique originale composée pour le film. <strong>Soundtrack</strong> = compilation de morceaux existants.</p>
            <p>Peut être diégétique (radio dans la scène) ou extra-diégétique (que le spectateur entend).</p>`,
            example: 'John Williams (Star Wars), Hans Zimmer (Inception), Ennio Morricone.'
        },
        'multi-pistes': {
            title: 'Enregistrement multi-pistes',
            description: `<p>Chaque source sonore (micro) enregistrée sur une <strong>piste séparée</strong> pour flexibilité au mixage.</p>
            <p>Permet d'ajuster individuellement chaque micro en post : niveau, égalisation, effets.</p>
            <p>Standard professionnel. Enregistreurs 4, 8 ou 16 pistes (Sound Devices, Zoom F8, etc.).</p>`,
            example: 'Un acteur avec cravate + perche = 2 pistes séparées pour choisir au mix.'
        },
        'ms-stereo': {
            title: 'MS (Mid-Side)',
            description: `<p>Configuration stéréo utilisant un micro cardioïde (Mid) et un micro bidirectionnel (Side).</p>
            <p>Avantage : la <strong>largeur stéréo est ajustable en post</strong>-production. Compatible mono parfait.</p>
            <p>Idéal pour les ambiances quand on ne connaît pas encore les besoins du mixage final.</p>`,
            example: 'Technique prisée des preneurs de son documentaire.'
        },
        'boom-vs-lav': {
            title: 'Boom vs Lavallier',
            description: `<p><strong>Perche (boom)</strong> : son naturel, perspective cohérente avec l'image, mais risque d'entrer dans le cadre.</p>
            <p><strong>Cravate (lav)</strong> : sécurité, toujours proche de la source, mais son moins naturel et risque de frottements.</p>
            <p>Idéalement : les deux en même temps pour avoir le choix au mixage.</p>`,
            example: 'Plan large = cravate en sécurité. Plan serré = perche privilégiée.'
        },
        'plant-mic': {
            title: 'Plant mic (Micro planté)',
            description: `<p>Micro <strong>caché dans le décor</strong>, fixe, pour capter le son quand la perche ne peut pas approcher.</p>
            <p>Utilisé pour les plans très larges, les scènes avec mouvement complexe, ou les décors difficiles.</p>
            <p>Placé stratégiquement : dans un bouquet, sous une table, derrière un objet.</p>`,
            example: 'Scène de dîner filmée en plan large avec plusieurs convives.'
        },
        'panning': {
            title: 'Panoramique audio (Panning)',
            description: `<p>Placement d'un son dans l'espace stéréo ou surround, de gauche à droite (et avant/arrière en surround).</p>
            <p>Doit généralement <strong>suivre l'image</strong> : un personnage à gauche de l'écran = voix légèrement à gauche.</p>
            <p>Les dialogues restent souvent centrés pour stabilité, les ambiances et effets sont spatialisés.</p>`,
            example: 'Une voiture traverse l écran : le son passe de gauche à droite.'
        },
        'formats-audio': {
            title: 'Formats audio (Mono/Stéréo/Surround)',
            description: `<p><strong>Mono</strong> : 1 canal, historique, encore utilisé pour dialogues centrés.</p>
            <p><strong>Stéréo (2.0)</strong> : Gauche/Droite, standard minimal TV et web.</p>
            <p><strong>5.1/7.1</strong> : Surround cinéma avec canaux arrière. <strong>Atmos</strong> : son 3D avec canaux au plafond.</p>`,
            example: 'Cinéma = minimum 5.1. Streaming = souvent stéréo avec option 5.1.'
        },
        'lfe': {
            title: 'LFE (Low Frequency Effects)',
            description: `<p>Canal dédié aux <strong>basses fréquences</strong> (20-120 Hz) dans les systèmes surround (le ".1" de 5.1).</p>
            <p>Reproduit par le caisson de basses (subwoofer). Utilisé pour les explosions, impacts, grondements, tension physique.</p>
            <p>Ressenti autant que entendu. Crée une expérience viscérale, physique.</p>`,
            example: 'Les explosions de Nolan, le rugissement du T-Rex dans Jurassic Park.'
        },
        // === MONTAGE - RACCORDS ===
        'raccord-axe': {
            title: 'Raccord dans l\'axe',
            description: `<p>Changement de valeur de plan (PE → PM → GP) en restant sur le <strong>même axe de caméra</strong>.</p>
            <p>Permet de se rapprocher ou s'éloigner du sujet sans changer d'angle, créant une intensification ou un recul émotionnel.</p>
            <p>Doit respecter la règle des 30° implicitement : le changement de valeur doit être suffisamment significatif.</p>`,
            example: 'Les zooms avant de Spielberg sur les visages en réaction.'
        },
        'raccord-mouvement': {
            title: 'Raccord mouvement',
            description: `<p>Coupe effectuée <strong>pendant une action</strong> (un geste, un déplacement) pour fluidifier la transition.</p>
            <p>Le mouvement commencé dans le plan A se poursuit dans le plan B. L'œil suit l'action et "oublie" la coupe.</p>
            <p>Technique fondamentale du montage invisible hollywoodien.</p>`,
            example: 'Un personnage se lève : coupe pendant le mouvement, pas avant ni après.'
        },
        'franchissement-axe': {
            title: 'Franchissement d\'axe',
            description: `<p>Passage de la caméra de l'autre côté de la <strong>ligne des 180°</strong>, inversant les positions apparentes des sujets.</p>
            <p>Généralement considéré comme une erreur désorientante. Mais peut être volontaire pour créer confusion, rupture ou malaise.</p>
            <p>Pour franchir proprement : plan neutre (sur la ligne), plan de coupe, ou mouvement de caméra visible.</p>`,
            example: 'Kubrick franchit volontairement dans Shining pour désorienter.'
        },
        'faux-raccord': {
            title: 'Faux raccord',
            description: `<p>Incohérence visuelle entre deux plans : accessoire qui change de place, niveau de verre différent, lumière incohérente.</p>
            <p>Erreur de <strong>continuité</strong> (script supervisor). Peut sortir le spectateur du film s'il est visible.</p>
            <p>Parfois inévitable (tourné sur plusieurs jours), le monteur essaie de les masquer ou les minimiser.</p>`,
            example: 'Les compilations de "movie mistakes" sur YouTube.'
        },
        // === MONTAGE - THÉORIES ===
        'montage-intellectuel': {
            title: 'Montage intellectuel (Eisenstein)',
            description: `<p>Théorie de Sergei Eisenstein : la <strong>collision</strong> de deux plans crée une idée nouvelle absente des deux.</p>
            <p>Plan A + Plan B = Concept C (thèse + antithèse = synthèse). Le sens émerge du choc, pas des images individuelles.</p>
            <p>Montage comme outil de pensée et d'argumentation, pas seulement de narration.</p>`,
            example: 'La séquence des escaliers d Odessa dans Le Cuirassé Potemkine.'
        },
        'montage-invisible': {
            title: 'Montage invisible (Classique)',
            description: `<p>Style hollywoodien classique où les coupes sont si <strong>fluides</strong> que le spectateur oublie qu'il regarde un film monté.</p>
            <p>Utilise : raccords regard, raccords mouvement, règle des 180°, continuité parfaite. Le montage sert l'histoire, pas lui-même.</p>
            <p>Objectif : immersion totale, suspension d'incrédulité maximale.</p>`,
            example: 'Les films de Spielberg, la plupart des blockbusters modernes.'
        },
        'montage-visible': {
            title: 'Montage visible (Moderne)',
            description: `<p>Style qui <strong>assume et exhibe</strong> les coupes : jump cuts, faux raccords volontaires, ruptures de rythme.</p>
            <p>Rappelle constamment au spectateur qu'il regarde un film. Associé à la Nouvelle Vague, au cinéma d'auteur.</p>
            <p>Peut créer énergie, malaise, modernité ou distanciation brechtienne.</p>`,
            example: 'À bout de souffle (Godard), les films de Wong Kar-wai.'
        },
        // === MONTAGE - MÉTHODES EISENSTEIN ===
        'montage-metrique': {
            title: 'Montage métrique',
            description: `<p>Coupes à <strong>intervalles réguliers</strong>, indépendamment du contenu des plans.</p>
            <p>Crée un rythme mécanique, hypnotique ou oppressant. La durée des plans est mathématiquement déterminée.</p>
            <p>Première des 5 méthodes de montage théorisées par Eisenstein.</p>`,
            example: 'Séquences de tension avec accélération progressive des coupes.'
        },
        'montage-rythmique': {
            title: 'Montage rythmique',
            description: `<p>Coupes dictées par le <strong>mouvement dans le plan</strong>, pas par une durée fixe.</p>
            <p>Le contenu visuel détermine le rythme : action rapide = coupe rapide, contemplation = plan long.</p>
            <p>Plus organique que le montage métrique, suit l'énergie interne des images.</p>`,
            example: 'Les poursuites en voiture, les scènes de combat.'
        },
        'montage-tonal': {
            title: 'Montage tonal',
            description: `<p>Coupes basées sur l'<strong>émotion dominante</strong> du plan : lumière, atmosphère, texture.</p>
            <p>Crée une continuité émotionnelle plutôt que narrative. Les plans "sonnent" ensemble.</p>
            <p>Utilisé pour les séquences poétiques, contemplatives ou expressionnistes.</p>`,
            example: 'Les séquences oniriques, les montages atmosphériques.'
        },
        // === MONTAGE - TECHNIQUES ===
        'montage-alterne': {
            title: 'Montage alterné (Cross-cutting)',
            description: `<p>Alternance entre <strong>deux actions simultanées</strong> dans des lieux différents.</p>
            <p>Crée suspense et tension : "Arrivera-t-il à temps ?" Les deux lignes convergent vers un climax commun.</p>
            <p>Inventé par D.W. Griffith. Outil fondamental du suspense cinématographique.</p>`,
            example: 'Le sauvetage de dernière minute, la course contre la montre.'
        },
        'flashback': {
            title: 'Flashback / Flash-forward',
            description: `<p><strong>Flashback</strong> : retour dans le passé pour révéler information, trauma ou souvenir.</p>
            <p><strong>Flash-forward</strong> : saut dans le futur, plus rare, crée anticipation ou ironie dramatique.</p>
            <p>Signalé visuellement (fondu, couleur différente) ou par le son (écho, musique spécifique).</p>`,
            example: 'Citizen Kane, Memento (structure inversée), Arrival.'
        },
        'sequence-montage': {
            title: 'Séquence de montage',
            description: `<p>Suite de plans courts <strong>condensant le temps</strong> : entraînement, transformation, passage des saisons.</p>
            <p>Souvent accompagnée de musique. Montre une évolution qui prendrait trop de temps en temps réel.</p>
            <p>Cliché quand mal utilisée, puissante quand justifiée narrativement.</p>`,
            example: 'Rocky (entraînement), Scarface (ascension), tout film de sport.'
        },
        'split-screen': {
            title: 'Split screen (Écran divisé)',
            description: `<p>Écran divisé en plusieurs zones montrant des <strong>actions simultanées</strong> visibles en même temps.</p>
            <p>Alternative au montage alterné : le spectateur voit tout sans coupe. Crée comparaison ou tension.</p>
            <p>Peut diviser en 2, 3, 4 zones ou plus. Signature de Brian De Palma.</p>`,
            example: 'Requiem for a Dream, 24 (série TV), Conversations secrètes.'
        },
        'smash-cut': {
            title: 'Smash cut',
            description: `<p>Coupe <strong>brutale et inattendue</strong>, souvent d'une scène calme vers une scène intense (ou l'inverse).</p>
            <p>Crée un effet de choc, de surprise, de rupture. Aucune transition, aucun avertissement.</p>
            <p>Souvent utilisé pour les réveils brutaux, les contrastes comiques ou dramatiques.</p>`,
            example: '"C est impossible !" SMASH CUT vers la scène où c est fait.'
        },
        // === MONTAGE - WORKFLOW ===
        'bout-a-bout': {
            title: 'Bout-à-bout (Assembly)',
            description: `<p>Premier assemblage chronologique des <strong>meilleures prises</strong> retenues.</p>
            <p>Pas encore du montage artistique : juste mettre les scènes dans l'ordre. Peut durer 3-4h pour un film de 2h.</p>
            <p>Permet de voir l'ensemble du matériel et d'identifier les problèmes majeurs.</p>`,
            example: 'Première étape après le dérushage et la synchronisation.'
        },
        'rough-cut': {
            title: 'Ours / Rough cut',
            description: `<p>Premier <strong>montage complet</strong> du film, encore long et imparfait.</p>
            <p>Structure narrative en place, mais rythme pas encore affiné. Contient souvent des scènes qui seront coupées.</p>
            <p>Base de travail pour les retours du réalisateur et des producteurs.</p>`,
            example: 'Généralement 20-30% plus long que le film final.'
        },
        'fine-cut': {
            title: 'Fine cut',
            description: `<p>Montage <strong>affiné</strong> : rythme ajusté, scènes inutiles supprimées, timing précis.</p>
            <p>Le film approche sa durée finale. Les choix majeurs sont faits, on peaufine les détails.</p>
            <p>Précède le picture lock (verrouillage image) après lequel on ne touche plus au montage.</p>`,
            example: 'Étape cruciale où chaque frame compte.'
        },
        // === PRODUCTION - ÉTAPES ===
        'developpement': {
            title: 'Développement',
            description: `<p>Première phase d'un projet : <strong>écriture du scénario</strong>, recherche de financements, montage du projet.</p>
            <p>Peut durer des mois ou des années. Inclut : traitement, versions du script, recherche de producteur, casting préliminaire.</p>
            <p>Phase la plus incertaine : beaucoup de projets ne dépassent jamais ce stade.</p>`,
            example: 'Certains scripts passent 10+ ans en développement avant d être tournés.'
        },
        'pre-production': {
            title: 'Pré-production',
            description: `<p>Phase de <strong>préparation</strong> entre le feu vert et le premier jour de tournage.</p>
            <p>Inclut : découpage technique, storyboard, casting, repérages, constitution de l'équipe, plan de travail, budget détaillé.</p>
            <p>Durée typique : 2-6 mois selon l'ampleur du projet. Une bonne prépa = un tournage serein.</p>`,
            example: '"Un film se gagne ou se perd en pré-production."'
        },
        'production-tournage': {
            title: 'Production (Tournage)',
            description: `<p>Phase de <strong>réalisation effective</strong> : caméra qui tourne, acteurs qui jouent.</p>
            <p>Période la plus intense et la plus coûteuse (équipe complète sur le terrain chaque jour).</p>
            <p>Durée typique : 4-12 semaines pour un long-métrage. Chaque jour de retard coûte très cher.</p>`,
            example: 'On dit "tourner un film" mais le tournage n est qu une phase parmi d autres.'
        },
        'post-production': {
            title: 'Post-production',
            description: `<p>Tout ce qui se passe <strong>après le tournage</strong> : montage, étalonnage, mixage, VFX, musique.</p>
            <p>Souvent plus longue que le tournage lui-même. C'est là que le film prend vraiment forme.</p>
            <p>Durée typique : 3-12 mois selon complexité (VFX lourds = plus long).</p>`,
            example: 'Un film Marvel peut passer 18 mois en post-production pour les VFX.'
        },
        'distribution': {
            title: 'Distribution',
            description: `<p>Phase de <strong>commercialisation</strong> : festivals, ventes internationales, sortie en salles, VOD, TV.</p>
            <p>Le distributeur achète les droits et gère : copies, marketing, programmation, relations presse.</p>
            <p>Un bon film mal distribué peut passer inaperçu. La distribution est cruciale pour le succès.</p>`,
            example: 'Cannes, Venise, Toronto = vitrines pour trouver des distributeurs.'
        },
        // === PRODUCTION - DOCUMENTS ===
        'budget-film': {
            title: 'Budget',
            description: `<p>Estimation détaillée de <strong>tous les coûts</strong> du film, divisée en postes et sous-postes.</p>
            <p><strong>Above the line</strong> : droits, scénario, réalisateur, producteur, acteurs principaux (coûts créatifs).</p>
            <p><strong>Below the line</strong> : équipe technique, matériel, décors, post-production (coûts de fabrication).</p>`,
            example: 'Un budget bien fait prévoit 10% de contingence pour les imprévus.'
        },
        'contrats-film': {
            title: 'Contrats',
            description: `<p>Documents juridiques <strong>encadrant les relations</strong> entre la production et tous les intervenants.</p>
            <p>Types : contrats d'engagement (équipe, acteurs), cession de droits (musique, scénario), accord de coproduction.</p>
            <p>Doivent préciser : rémunération, droits cédés, crédits, durée, territoire, obligations.</p>`,
            example: 'CDDU (intermittents), contrats de cession de droits d auteur.'
        },
        // === PRODUCTION - POSTES CLÉS ===
        'producteur': {
            title: 'Producteur',
            description: `<p>Responsable <strong>global du projet</strong> : financement, supervision créative et logistique.</p>
            <p>Trouve l'argent, engage le réalisateur, supervise la production, prend les décisions stratégiques.</p>
            <p>Plusieurs types : producteur délégué (patron), exécutif (supervise), associé (apporte quelque chose).</p>`,
            example: 'Le producteur a le final cut aux USA, le réalisateur en France (souvent).'
        },
        'directeur-production': {
            title: 'Directeur de production',
            description: `<p>Bras droit du producteur, gère le <strong>budget et la logistique</strong> au quotidien.</p>
            <p>Établit le budget détaillé, négocie les contrats, surveille les dépenses, résout les problèmes concrets.</p>
            <p>Interface entre les besoins artistiques et les contraintes financières.</p>`,
            example: 'C est lui qui dit "on n a pas le budget pour ça" (ou trouve comment l avoir).'
        },
        'premier-assistant': {
            title: '1er Assistant réalisateur',
            description: `<p><strong>Chef d'orchestre du plateau</strong> : gère le planning, le timing, la coordination de toute l'équipe.</p>
            <p>Établit le plan de travail, organise chaque journée, annonce les ordres ("Silence, on tourne !").</p>
            <p>Libère le réalisateur des contraintes logistiques pour qu'il se concentre sur l'artistique.</p>`,
            example: 'Le 1er AD connaît le plan de travail par cœur et anticipe tout.'
        },
        'regisseur': {
            title: 'Régisseur',
            description: `<p>Responsable de la <strong>logistique quotidienne</strong> : lieux, transports, repas, hébergement.</p>
            <p>Négocie les autorisations de tournage, organise les décors, gère les imprévus pratiques.</p>
            <p>Le "couteau suisse" de la production, doit résoudre tous les problèmes concrets.</p>`,
            example: 'Trouver 50 figurants pour demain, un camion de pompiers, et un repas végan.'
        },
        // === IMAGE - FORMAT ===
        'ratio-169': {
            title: 'Format 16:9 (1.78:1)',
            description: `<p>Ratio <strong>standard actuel</strong> pour la télévision HD, le streaming et la plupart des écrans.</p>
            <p>Compromis entre le 4:3 télévisuel historique et le 1.85:1 cinéma. Adopté mondialement depuis les années 2000.</p>
            <p>Format natif des capteurs HD, 4K, des écrans TV et ordinateurs modernes.</p>`,
            example: 'Netflix, YouTube, télévision HD, la majorité du contenu actuel.'
        },
        // === SCÉNARIO - FORMAT ===
        'personnage-scenario': {
            title: 'Personnage (Character cue)',
            description: `<p>Nom du personnage en <strong>MAJUSCULES</strong>, centré, avant chaque réplique de dialogue.</p>
            <p>Première apparition : nom suivi de (âge) et brève description. Ensuite : juste le nom.</p>
            <p>Cohérence obligatoire : toujours le même nom (pas "MARIE" puis "LA FEMME" pour le même personnage).</p>`,
            example: 'MARIE (30 ans, nerveuse, élégante malgré elle) entre dans le café.'
        },
        'sfx': {
            title: 'Effets sonores (SFX)',
            description: `<p>Sons ponctuels synchronisés à l'image : portes, pas, coups, véhicules, explosions.</p>
            <p>Peuvent être <strong>réalistes</strong> (enregistrés) ou <strong>stylisés</strong> (créés pour l'effet dramatique).</p>
            <p>Différent du Foley (bruitage en studio) : SFX = sons pré-enregistrés en bibliothèque ou créés en sound design.</p>`,
            example: 'Le sabre laser de Star Wars (SFX créé par Ben Burtt).'
        },
        'lumiere-naturelle': {
            title: 'Lumière naturelle',
            description: `<p>Utilisation exclusive ou principale du soleil comme source de lumière, sans éclairage artificiel.</p>
            <p>Crée un <strong>réalisme</strong> et une authenticité uniques. Demande une grande maîtrise des horaires et de la météo.</p>
            <p>Signature de Terrence Malick et Emmanuel Lubezki. Contraignant mais résultats organiques.</p>`,
            image: `<img src="/images/cours/lumiere-naturelle.jpeg" alt="Lumière naturelle" class="w-full-r8">`,
            example: 'The Tree of Life, The Revenant, Days of Heaven.'
        },
        'decoupage-technique': {
            title: 'Découpage technique',
            description: `<p>Document détaillant plan par plan comment le scénario sera filmé : valeurs de plan, mouvements, axes.</p>
            <p>Établi par le réalisateur en pré-production, c'est la <strong>partition</strong> du tournage.</p>
            <p>Peut être accompagné d'un storyboard pour visualiser les plans complexes.</p>`,
            example: 'Préparé par le réalisateur avec le 1er assistant.'
        },
        'plan-travail': {
            title: 'Plan de travail',
            description: `<p>Calendrier détaillé du tournage, jour par jour, répartissant les scènes du scénario.</p>
            <p>Optimisé par décor, disponibilité des comédiens, contraintes jour/nuit, météo, difficultés techniques.</p>
            <p>Document évolutif, constamment ajusté par le 1er assistant réalisateur. La colonne vertébrale du tournage.</p>`,
            example: 'On ne tourne JAMAIS dans l ordre du scénario.'
        }
    },
    
    getCourses: () => ({
        scenario: `
            <div class="courses-section">
                <h2>📝 Les Fondamentaux du Scénario</h2>
                
                <h3><span class="notion" data-notion="structure-3-actes">La Structure en 3 Actes</span></h3>
                <p>La structure classique d'un scénario se divise en trois actes :</p>
                <ul>
                    <li><strong>Acte I - L'Exposition (25%)</strong> : Présentation du personnage, de son monde et de l'élément déclencheur qui lance l'histoire.</li>
                    <li><strong>Acte II - La Confrontation (50%)</strong> : Le personnage fait face à des obstacles croissants. Contient le <span class="notion" data-notion="midpoint">point médian</span> et la crise.</li>
                    <li><strong>Acte III - La Résolution (25%)</strong> : Climax et dénouement. Le personnage atteint (ou non) son objectif.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Astuce :</strong> Une page de scénario = environ 1 minute de film. Un long-métrage fait généralement 90-120 pages.
                </div>
                
                <h3>Les Éléments Clés</h3>
                <ul>
                    <li><span class="notion" data-notion="protagoniste">Le protagoniste</span> : Personnage principal avec un objectif clair et des obstacles à surmonter.</li>
                    <li><span class="notion" data-notion="antagoniste">L'antagoniste</span> : Force qui s'oppose au protagoniste (personne, institution, nature, lui-même).</li>
                    <li><span class="notion" data-notion="enjeu">L'enjeu</span> : Ce que le protagoniste risque de perdre s'il échoue.</li>
                    <li><span class="notion" data-notion="conflit">Le conflit</span> : Moteur de l'histoire, crée la tension dramatique.</li>
                </ul>
                
                <h3>Le Format du Scénario</h3>
                <ul>
                    <li><span class="notion" data-notion="entete-scene">En-tête de scène</span> : INT./EXT. - LIEU - MOMENT (ex: INT. APPARTEMENT - JOUR)</li>
                    <li><span class="notion" data-notion="action-scenario">Action</span> : Description au présent, ce qu'on voit et entend.</li>
                    <li><span class="notion" data-notion="personnage-scenario">Personnage</span> : Nom en majuscules centré avant chaque dialogue.</li>
                    <li><span class="notion" data-notion="dialogue-scenario">Dialogue</span> : Ce que dit le personnage.</li>
                    <li><span class="notion" data-notion="didascalie">Didascalie</span> : Indication de jeu entre parenthèses.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Attention :</strong> N'écrivez jamais ce qu'on ne peut pas voir ou entendre (pensées, backstory non montrée).
                </div>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3><span class="notion" data-notion="voyage-heros">Le Voyage du Héros</span> (Joseph Campbell)</h3>
                <p>Théorisé dans <em>"Le Héros aux mille visages"</em> (1949), ce modèle universel décrit le parcours archétypal du héros en 12 étapes :</p>
                <ul>
                    <li><strong>1. Le monde ordinaire</strong> : Le héros dans son quotidien avant l'aventure.</li>
                    <li><strong>2. L'appel de l'aventure</strong> : Un événement perturbe l'équilibre.</li>
                    <li><strong>3. Le refus de l'appel</strong> : Hésitation, peur de l'inconnu.</li>
                    <li><strong>4. La rencontre avec le mentor</strong> : Un guide apporte sagesse ou outils.</li>
                    <li><strong>5. Le passage du premier seuil</strong> : Entrée dans le monde extraordinaire.</li>
                    <li><strong>6. Épreuves, alliés et ennemis</strong> : Apprentissage des nouvelles règles.</li>
                    <li><strong>7. L'approche de la caverne</strong> : Préparation à l'épreuve centrale.</li>
                    <li><strong>8. L'épreuve suprême</strong> : Confrontation avec la plus grande peur.</li>
                    <li><strong>9. La récompense</strong> : Le héros s'empare du trésor.</li>
                    <li><strong>10. Le chemin du retour</strong> : Course-poursuite vers le monde ordinaire.</li>
                    <li><strong>11. La résurrection</strong> : Dernière épreuve, transformation finale.</li>
                    <li><strong>12. Le retour avec l'élixir</strong> : Le héros revient changé avec un don pour les siens.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Application :</strong> Christopher Vogler a adapté ce modèle pour Hollywood dans <em>"The Writer's Journey"</em> (1992), devenu une référence dans les studios.
                </div>
                
                <h3>Le Paradigme de Syd Field</h3>
                <p>Dans <em>"Screenplay"</em> (1979), Syd Field formalise la structure en 3 actes avec des points précis :</p>
                <ul>
                    <li><span class="notion" data-notion="plot-point">Plot Point 1 (page 25-27)</span> : Événement qui fait basculer l'histoire vers l'Acte II.</li>
                    <li><span class="notion" data-notion="midpoint">Midpoint (page 60)</span> : Révélation ou retournement au milieu de l'Acte II.</li>
                    <li><span class="notion" data-notion="plot-point">Plot Point 2 (page 85-90)</span> : Lance le héros vers le climax de l'Acte III.</li>
                </ul>
                
                <h3>Save the Cat! (Blake Snyder)</h3>
                <p><em>"Save the Cat!"</em> (2005) propose une structure ultra-précise en 15 "beats" :</p>
                <ul>
                    <li><strong>Opening Image</strong> (p.1) : Ton et atmosphère du film.</li>
                    <li><strong>Theme Stated</strong> (p.5) : Le thème énoncé (souvent dans un dialogue).</li>
                    <li><strong>Set-Up</strong> (p.1-10) : Présentation du monde et des personnages.</li>
                    <li><strong>Catalyst</strong> (p.12) : L'élément déclencheur.</li>
                    <li><strong>Debate</strong> (p.12-25) : Hésitation du héros.</li>
                    <li><strong>Break into Two</strong> (p.25) : Choix d'entrer dans l'aventure.</li>
                    <li><strong>B Story</strong> (p.30) : Histoire secondaire (souvent l'amour).</li>
                    <li><strong>Fun and Games</strong> (p.30-55) : La "promesse du pitch".</li>
                    <li><strong>Midpoint</strong> (p.55) : Fausse victoire ou fausse défaite.</li>
                    <li><strong>Bad Guys Close In</strong> (p.55-75) : Pression croissante.</li>
                    <li><strong>All Is Lost</strong> (p.75) : Le point le plus bas.</li>
                    <li><strong>Dark Night of the Soul</strong> (p.75-85) : Désespoir avant la renaissance.</li>
                    <li><strong>Break into Three</strong> (p.85) : Solution trouvée.</li>
                    <li><strong>Finale</strong> (p.85-110) : Exécution du plan, climax.</li>
                    <li><strong>Final Image</strong> (p.110) : Miroir de l'image d'ouverture, preuve du changement.</li>
                </ul>
                
                <h3><span class="notion" data-notion="arc-transformationnel">L'Arc Transformationnel</span> du Personnage</h3>
                <p>Un personnage mémorable subit une transformation intérieure :</p>
                <ul>
                    <li><span class="notion" data-notion="ghost">La Blessure (Ghost)</span> : Trauma du passé qui définit ses peurs.</li>
                    <li><span class="notion" data-notion="lie">La Croyance limitante (Lie)</span> : Ce que le personnage croit à tort.</li>
                    <li><span class="notion" data-notion="besoin-vs-desir">Le Besoin vs le Désir</span> : Ce qu'il veut ≠ ce dont il a vraiment besoin.</li>
                    <li><span class="notion" data-notion="verite-personnage">La Vérité (Truth)</span> : Ce qu'il doit apprendre pour évoluer.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Attention :</strong> Certains films utilisent des arcs "négatifs" (le personnage empire) ou "plats" (il reste fidèle à ses valeurs malgré tout). Ces variations sont volontaires et puissantes.
                </div>
                
                <h3>Théories Alternatives</h3>
                <ul>
                    <li><strong>Structure en 4 Actes</strong> (Kristin Thompson) : Divise l'Acte II en deux parties distinctes.</li>
                    <li><strong>Séquences de 8</strong> (Frank Daniel) : 8 séquences de 12-15 minutes chacune.</li>
                    <li><strong>Story Circle</strong> (Dan Harmon) : Version simplifiée du voyage du héros en 8 étapes.</li>
                    <li><strong>Kishotenketsu</strong> : Structure japonaise en 4 parties sans conflit central.</li>
                    <li><strong>Anti-structure</strong> (Robert McKee) : Films d'auteur qui déconstruisent les conventions.</li>
                </ul>
                
                <h3>📚 Ouvrages de Référence</h3>
                <ul>
                    <li><strong>"Story"</strong> - Robert McKee (1997) : La bible de la narration, analyse approfondie des principes dramatiques.</li>
                    <li><strong>"Screenplay"</strong> - Syd Field (1979) : Le livre fondateur de la structure moderne.</li>
                    <li><strong>"Save the Cat!"</strong> - Blake Snyder (2005) : Approche pragmatique et commerciale.</li>
                    <li><strong>"The Writer's Journey"</strong> - Christopher Vogler (1992) : Adaptation du voyage du héros.</li>
                    <li><strong>"Into the Woods"</strong> - John Yorke (2013) : Pourquoi les histoires fonctionnent.</li>
                    <li><strong>"L'anatomie du scénario"</strong> - John Truby (2010) : 22 étapes pour une histoire organique.</li>
                    <li><strong>"Le Héros aux mille visages"</strong> - Joseph Campbell (1949) : L'œuvre mythologique originelle.</li>
                    <li><strong>"Poétique"</strong> - Aristote (~335 av. J.-C.) : Les fondements millénaires de la dramaturgie.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Conseil :</strong> Étudiez ces théories, puis oubliez-les en écrivant. Elles servent à analyser et réécrire, pas à brider la créativité du premier jet.
                </div>
            </div>
        `,
        
        realisation: `
            <div class="courses-section">
                <h2>🎬 Les Bases de la Réalisation</h2>
                
                <h3>La Préparation (Pré-production)</h3>
                <ul>
                    <li><span class="notion" data-notion="decoupage-technique">Découpage technique</span> : Transformer le scénario en plans à tourner.</li>
                    <li><span class="notion" data-notion="storyboard">Storyboard</span> : Dessiner chaque plan pour visualiser le film.</li>
                    <li><span class="notion" data-notion="reperages">Repérages</span> : Trouver et valider les lieux de tournage.</li>
                    <li><span class="notion" data-notion="casting">Casting</span> : Sélectionner les comédiens.</li>
                    <li><span class="notion" data-notion="plan-travail">Plan de travail</span> : Organiser les journées de tournage.</li>
                </ul>
                
                <h3>Les Valeurs de Plan</h3>
                <ul>
                    <li><span class="notion" data-notion="plan-ensemble">Plan d'ensemble (PE)</span> : Situe l'action dans un décor large.</li>
                    <li><span class="notion" data-notion="plan-large">Plan large (PL)</span> : Montre les personnages en pied dans leur environnement.</li>
                    <li><span class="notion" data-notion="plan-moyen">Plan moyen (PM)</span> : Personnage cadré à mi-cuisse.</li>
                    <li><span class="notion" data-notion="plan-americain">Plan américain (PA)</span> : Personnage cadré au niveau des genoux.</li>
                    <li><span class="notion" data-notion="plan-rapproche">Plan rapproché (PR)</span> : Cadré à la poitrine ou aux épaules.</li>
                    <li><span class="notion" data-notion="gros-plan">Gros plan (GP)</span> : Visage ou objet en entier.</li>
                    <li><span class="notion" data-notion="tres-gros-plan">Très gros plan (TGP)</span> : Détail (œil, main, objet).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Règle des 180°</strong> : Imaginez une ligne entre deux personnages. Restez toujours du même côté pour maintenir la cohérence spatiale.
                </div>
                
                <h3>Diriger les Comédiens</h3>
                <ul>
                    <li>Donnez des <strong>objectifs</strong> plutôt que des émotions ("tu veux le convaincre" vs "sois triste").</li>
                    <li>Créez un <strong>climat de confiance</strong> sur le plateau.</li>
                    <li>Faites des <strong>répétitions</strong> avant le tournage.</li>
                    <li>Laissez les acteurs <strong>proposer</strong> et ajustez.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>La Grammaire Cinématographique</h3>
                <p>Chaque choix de plan est un mot, chaque séquence une phrase. Le réalisateur construit un langage visuel :</p>
                <ul>
                    <li><span class="notion" data-notion="plan-subjectif">Plan subjectif (POV)</span> : La caméra devient les yeux du personnage. Crée identification et immersion.</li>
                    <li><span class="notion" data-notion="plan-objectif">Plan objectif</span> : Point de vue neutre, observateur extérieur.</li>
                    <li><span class="notion" data-notion="plan-semi-subjectif">Plan semi-subjectif</span> : Caméra proche du personnage, partage son espace sans être ses yeux.</li>
                    <li><span class="notion" data-notion="plongee">Plongée</span> : Caméra au-dessus du sujet. Écrase, diminue, rend vulnérable.</li>
                    <li><span class="notion" data-notion="contre-plongee">Contre-plongée</span> : Caméra en dessous. Grandit, héroïse, menace.</li>
                    <li><span class="notion" data-notion="dutch-angle">Dutch angle</span> : Caméra inclinée. Malaise, déséquilibre, folie.</li>
                </ul>
                
                <h3>Les Axes de Regard et la Géographie</h3>
                <ul>
                    <li><span class="notion" data-notion="ligne-180">Ligne des 180°</span> : Axe imaginaire entre deux sujets. Ne jamais la franchir sans transition.</li>
                    <li><span class="notion" data-notion="ligne-30">Ligne des 30°</span> : Entre deux plans, changez au minimum de 30° pour éviter le jump cut.</li>
                    <li><span class="notion" data-notion="raccord-regard">Raccord regard</span> : Si A regarde à droite, B doit regarder à gauche au plan suivant.</li>
                    <li><span class="notion" data-notion="champ-contrechamp">Champ/Contre-champ</span> : Alterner entre deux points de vue opposés (dialogue).</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Franchissement volontaire :</strong> Certains réalisateurs franchissent la ligne intentionnellement pour créer confusion ou rupture (ex: Kubrick dans Shining).
                </div>
                
                <h3>Les Techniques de Mise en Scène</h3>
                <ul>
                    <li><span class="notion" data-notion="blocking">Blocking</span> : Placement et déplacement des acteurs dans le décor. Un bon blocking raconte sans dialogue.</li>
                    <li><span class="notion" data-notion="staging">Staging</span> : Organisation des éléments dans le cadre pour guider le regard.</li>
                    <li><span class="notion" data-notion="plan-sequence">Plan-séquence</span> : Toute une scène en un seul plan. Demande chorégraphie parfaite.</li>
                    <li><span class="notion" data-notion="oner">Oner</span> : Plan-séquence virtuose souvent en travelling complexe.</li>
                    <li><span class="notion" data-notion="split-focus">Split focus (diopter)</span> : Deux plans de netteté simultanés (De Palma).</li>
                </ul>
                
                <h3>Styles et Approches de Réalisation</h3>
                <ul>
                    <li><span class="notion" data-notion="decoupage-classique">Découpage classique (Hollywood)</span> : Master shot + coverage. Montage fluide, invisible.</li>
                    <li><span class="notion" data-notion="decoupage-europeen">Découpage européen</span> : Plans plus longs, moins de coupes, respiration.</li>
                    <li><span class="notion" data-notion="camera-epaule">Caméra-épaule</span> : Immersion documentaire, urgence, réalisme (Dardenne, Greengrass).</li>
                    <li><span class="notion" data-notion="steadicam">Steadicam</span> : Fluidité onirique, exploration spatiale (Kubrick, Scorsese).</li>
                    <li><span class="notion" data-notion="oner">Style "oner"</span> : Tout ou partie du film en faux plan-séquence (Birdman, 1917).</li>
                    <li><span class="notion" data-notion="minimalisme">Minimalisme</span> : Économie de moyens, cadres fixes, temps réel (Kiarostami, Haneke).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Citation :</strong> "Un film se fait trois fois : à lécriture, au tournage et au montage." - Robert Bresson
                </div>
                
                <h3>Direction dActeurs : Méthodes Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="stanislavski">Méthode Stanislavski</span> : Recherche de la vérité émotionnelle, mémoire affective.</li>
                    <li><span class="notion" data-notion="actors-studio">Actors Studio (Lee Strasberg)</span> : Immersion totale dans le personnage.</li>
                    <li><span class="notion" data-notion="meisner">Technique Meisner</span> : Réaction instinctive, écoute du partenaire.</li>
                    <li><span class="notion" data-notion="approche-bresson">Approche Bresson</span> : "Modèles" non-acteurs, répétition jusquà épuisement du jeu.</li>
                    <li><span class="notion" data-notion="improvisation-dirigee">Improvisation dirigée</span> : Cadre défini, liberté dans lexécution (Cassavetes, Leigh).</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Hitchcock/Truffaut"</strong> - François Truffaut (1966) : Masterclass du maître du suspense.</li>
                    <li><strong>"Notes sur le cinématographe"</strong> - Robert Bresson (1975) : Aphorismes dun puriste.</li>
                    <li><strong>"Faire un film"</strong> - Sidney Lumet (1995) : Guide pratique dun vétéran.</li>
                    <li><strong>"In the Blink of an Eye"</strong> - Walter Murch (2001) : Réflexions sur le montage.</li>
                    <li><strong>"Rebel Without a Crew"</strong> - Robert Rodriguez (1995) : Cinéma guérilla et débrouille.</li>
                    <li><strong>"On Directing Film"</strong> - David Mamet (1991) : Approche minimaliste et efficace.</li>
                    <li><strong>"Le Plaisir des yeux"</strong> - François Truffaut : Écrits sur le cinéma.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Mise en Scène)</h3>
                <ul>
                    <li><strong>Citizen Kane</strong> (Welles, 1941) : Profondeur de champ, plongées, narration éclatée.</li>
                    <li><strong>Vertigo</strong> (Hitchcock, 1958) : Effet vertigo (zoom/travelling opposés), obsession visuelle.</li>
                    <li><strong>Les Affranchis</strong> (Scorsese, 1990) : Steadicam légendaire du Copacabana.</li>
                    <li><strong>Oldboy</strong> (Park Chan-wook, 2003) : Plan-séquence de combat latéral.</li>
                    <li><strong>Children of Men</strong> (Cuarón, 2006) : Longs plans-séquences immersifs.</li>
                    <li><strong>Birdman</strong> (Iñárritu, 2014) : Faux plan-séquence intégral.</li>
                </ul>
            </div>
        `,
        
        image: `
            <div class="courses-section">
                <h2>📷 L'Image Cinématographique</h2>
                
                <h3>La Composition</h3>
                <ul>
                    <li><span class="notion" data-notion="regle-tiers">Règle des tiers</span> : Placez les éléments importants sur les intersections d'une grille 3×3.</li>
                    <li><span class="notion" data-notion="lignes-directrices">Lignes directrices</span> : Utilisez les lignes naturelles pour guider le regard.</li>
                    <li><span class="notion" data-notion="profondeur-champ">Profondeur de champ</span> : Jouez avec le flou pour isoler le sujet.</li>
                    <li><span class="notion" data-notion="headroom">Headroom</span> : Espace au-dessus de la tête du sujet.</li>
                    <li><span class="notion" data-notion="looking-room">Looking room</span> : Espace devant le regard du personnage.</li>
                </ul>
                
                <h3>L'Éclairage - Le Triangle de Base</h3>
                <ul>
                    <li><span class="notion" data-notion="key-light">Key Light (lumière principale)</span> : Source principale, définit les ombres.</li>
                    <li><span class="notion" data-notion="fill-light">Fill Light (lumière de remplissage)</span> : Adoucit les ombres créées par la key.</li>
                    <li><span class="notion" data-notion="back-light">Back Light (contre-jour)</span> : Sépare le sujet du fond, crée du relief.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Ratio d'éclairage :</strong> Pour un look naturel, la fill light est 2 stops en dessous de la key. Pour un look dramatique, augmentez l'écart.
                </div>
                
                <h3>Les Mouvements de Caméra</h3>
                <ul>
                    <li><span class="notion" data-notion="panoramique">Panoramique</span> : Rotation horizontale ou verticale sur pied fixe.</li>
                    <li><span class="notion" data-notion="travelling">Travelling</span> : Déplacement physique de la caméra (avant, arrière, latéral).</li>
                    <li><span class="notion" data-notion="zoom">Zoom</span> : Changement de focale (différent du travelling !).</li>
                    <li><span class="notion" data-notion="steadicam">Steadicam</span> : Travelling fluide avec harnais stabilisateur.</li>
                    <li><span class="notion" data-notion="grue-jib">Grue/Jib</span> : Mouvements verticaux amples.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Les Optiques et Leurs Effets</h3>
                <ul>
                    <li><span class="notion" data-notion="focale-courte">Focale courte (grand-angle, 16-35mm)</span> : Exagère les perspectives, déforme les bords, agrandit les espaces. Idéal pour oppression ou immensité.</li>
                    <li><span class="notion" data-notion="focale-normale">Focale normale (50mm)</span> : Proche de la vision humaine, naturelle et neutre.</li>
                    <li><span class="notion" data-notion="focale-longue">Focale longue (85-200mm)</span> : Compresse les distances, isole le sujet, flou darrière-plan prononcé. Portrait, intimité.</li>
                    <li><span class="notion" data-notion="anamorphique">Objectifs anamorphiques</span> : Ratio 2.39:1, flares horizontaux caractéristiques, bokeh ovale. Look "cinéma".</li>
                    <li><span class="notion" data-notion="macro">Macro</span> : Très gros plans sur petits objets (insectes, textures).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Astuce focale :</strong> Spielberg utilise souvent des focales courtes près des visages pour créer malaise. Kubrick préférait les focales très courtes (9.8mm dans Barry Lyndon).
                </div>
                
                <h3>Techniques dÉclairage Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="high-key">High-key</span> : Éclairage uniforme, peu dombres. Comédies, sitcoms, publicité.</li>
                    <li><span class="notion" data-notion="low-key">Low-key</span> : Forts contrastes, ombres marquées. Film noir, thriller, horreur.</li>
                    <li><span class="notion" data-notion="chiaroscuro">Chiaroscuro</span> : Clair-obscur inspiré de la peinture (Caravage). Drame intense.</li>
                    <li><span class="notion" data-notion="rembrandt-lighting">Rembrandt lighting</span> : Triangle de lumière sous un œil. Portrait classique.</li>
                    <li><span class="notion" data-notion="lumiere-pratique">Lumière pratique</span> : Sources visibles à lécran (lampes, bougies, écrans).</li>
                    <li><span class="notion" data-notion="lumiere-naturelle">Lumière naturelle</span> : Utilisation exclusive du soleil (Malick, Lubezki).</li>
                    <li><span class="notion" data-notion="magic-hour">Magic hour</span> : Tournage à laube ou au crépuscule pour lumière dorée.</li>
                </ul>
                
                <h3>La Colorimétrie</h3>
                <ul>
                    <li><span class="notion" data-notion="temperature-couleur">Température de couleur</span> : Kelvin (K). 3200K = tungstène chaud, 5600K = lumière du jour.</li>
                    <li><span class="notion" data-notion="balance-blancs">Balance des blancs</span> : Calibrer la caméra pour que le blanc soit neutre.</li>
                    <li><span class="notion" data-notion="lut">LUT (Look-Up Table)</span> : Préréglage de correction colorimétrique.</li>
                    <li><span class="notion" data-notion="log-raw">LOG / RAW</span> : Profils plats qui conservent maximum dinformations pour létalonnage.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Mélange de sources :</strong> Attention aux mélanges tungstène/daylight non voulus. Utilisez des gélatines (CTO/CTB) pour harmoniser.
                </div>
                
                <h3>Formats et Ratios dImage</h3>
                <ul>
                    <li><span class="notion" data-notion="ratio-43">1.33:1 (4:3)</span> : Format classique, télévision ancienne, intimiste.</li>
                    <li><span class="notion" data-notion="ratio-185">1.85:1</span> : Standard cinéma américain.</li>
                    <li><span class="notion" data-notion="ratio-scope">2.39:1 (Scope)</span> : Cinémascope, épique, paysages.</li>
                    <li><span class="notion" data-notion="ratio-169">16:9 (1.78:1)</span> : Standard HD/TV actuel.</li>
                    <li><span class="notion" data-notion="ratio-imax">IMAX (1.43:1)</span> : Format géant immersif.</li>
                </ul>
                
                <h3>Le Cadre comme Outil Narratif</h3>
                <ul>
                    <li><span class="notion" data-notion="cadre-ferme">Cadre fermé</span> : Éléments qui emprisonnent (portes, fenêtres). Oppression.</li>
                    <li><span class="notion" data-notion="cadre-ouvert">Cadre ouvert</span> : Espace libre, personnage peut sortir du champ. Liberté.</li>
                    <li><span class="notion" data-notion="surcadrage">Surcadrage</span> : Cadre dans le cadre (miroir, écran, porte). Mise en abyme.</li>
                    <li><span class="notion" data-notion="amorce">Amorce</span> : Élément flou au premier plan. Profondeur, voyeurisme.</li>
                    <li><span class="notion" data-notion="hors-champ">Hors-champ</span> : Ce quon ne voit pas mais devine. Suggestion puissante.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Painting with Light"</strong> - John Alton (1949) : Bible de léclairage hollywoodien.</li>
                    <li><strong>"Cinematography: Theory and Practice"</strong> - Blain Brown : Manuel technique complet.</li>
                    <li><strong>"Masters of Light"</strong> - Dennis Schaefer : Interviews de grands directeurs photo.</li>
                    <li><strong>"FilmCraft: Cinematography"</strong> - Mike Goodridge : Témoignages contemporains.</li>
                    <li><strong>"The Visual Story"</strong> - Bruce Block : Narration visuelle et composition.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Direction Photo)</h3>
                <ul>
                    <li><strong>Blade Runner</strong> (Jordan Cronenweth, 1982) : Néons, fumée, low-key futuriste.</li>
                    <li><strong>Barry Lyndon</strong> (John Alcott, 1975) : Éclairage à la bougie, lumière naturelle.</li>
                    <li><strong>The Revenant</strong> (Emmanuel Lubezki, 2015) : Lumière naturelle exclusive.</li>
                    <li><strong>In the Mood for Love</strong> (Christopher Doyle, 2000) : Couleurs saturées, surcadrages.</li>
                    <li><strong>Skyfall</strong> (Roger Deakins, 2012) : Silhouettes, contre-jours, couleurs symboliques.</li>
                    <li><strong>Amélie Poulain</strong> (Bruno Delbonnel, 2001) : Palette verte/rouge distinctive.</li>
                </ul>
            </div>
        `,
        
        son: `
            <div class="courses-section">
                <h2>🎤 La Prise de Son</h2>
                
                <h3>Les Types de Microphones</h3>
                <ul>
                    <li><span class="notion" data-notion="micro-canon">Canon (shotgun)</span> : Directionnel, idéal pour isoler une source. Utilisé sur perche.</li>
                    <li><span class="notion" data-notion="micro-cravate">Cravate (lavalier)</span> : Micro miniature fixé sur le comédien. Discret mais risque de frottements.</li>
                    <li><span class="notion" data-notion="micro-omni">Omnidirectionnel</span> : Capte dans toutes les directions. Bon pour les ambiances.</li>
                </ul>
                
                <h3>Règles de Base</h3>
                <ul>
                    <li><strong>Proximité</strong> : Plus le micro est proche, meilleur est le son (sans entrer dans le cadre !).</li>
                    <li><strong>Orientation</strong> : Le micro canon doit pointer vers la bouche de l'acteur.</li>
                    <li><strong>Ambiance</strong> : Toujours enregistrer 1-2 min de "silence" de chaque lieu.</li>
                    <li><strong>Son témoin</strong> : Le son de la caméra sert uniquement à la synchronisation.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Ennemis du son :</strong> Climatisation, frigos, néons, avions, circulation, vent, vêtements synthétiques.
                </div>
                
                <h3>Les Niveaux</h3>
                <ul>
                    <li>Dialogues : viser <strong>-12 dB à -6 dB</strong> en crête.</li>
                    <li>Ne jamais dépasser <strong>0 dB</strong> (saturation = irrécupérable).</li>
                    <li>Toujours surveiller au <strong>casque</strong> pendant l'enregistrement.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Les Couches Sonores dun Film</h3>
                <p>Le son au cinéma se compose de plusieurs éléments superposés :</p>
                <ul>
                    <li><span class="notion" data-notion="dialogues-son">Dialogues</span> : Voix des personnages, élément principal à protéger.</li>
                    <li><span class="notion" data-notion="ambiance-son">Ambiances</span> : Son continu dun lieu (ville, forêt, intérieur). Crée lespace.</li>
                    <li><span class="notion" data-notion="sfx">Effets sonores (SFX)</span> : Sons ponctuels synchronisés (portes, pas, objets).</li>
                    <li><span class="notion" data-notion="foley">Foley</span> : Bruitages recréés en studio (pas, vêtements, manipulations).</li>
                    <li><span class="notion" data-notion="musique-film">Musique</span> : Score original ou morceaux existants.</li>
                    <li><span class="notion" data-notion="silence-cinematographique">Silence</span> : Outil dramatique puissant, souvent sous-estimé.</li>
                </ul>
                
                <h3>Son Diégétique vs Extra-diégétique</h3>
                <ul>
                    <li><span class="notion" data-notion="son-diegetique">Diégétique</span> : Source sonore présente dans lunivers du film (radio, musicien à lécran).</li>
                    <li><span class="notion" data-notion="son-extra-diegetique">Extra-diégétique</span> : Son ajouté que les personnages nentendent pas (musique de film, voix-off).</li>
                    <li><span class="notion" data-notion="meta-diegetique">Meta-diégétique</span> : Son subjectif (acouphène, battement de cœur, souvenir sonore).</li>
                    <li><span class="notion" data-notion="trans-diegetique">Trans-diégétique</span> : Passage dun état à lautre (musique qui devient diégétique).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Exemple :</strong> Dans Apocalypse Now, "The End" des Doors passe de musique extra-diégétique à la radio de lhélicoptère (diégétique).
                </div>
                
                <h3>Techniques de Prise de Son Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="double-systeme">Double système</span> : Enregistrement séparé caméra/enregistreur. Qualité professionnelle.</li>
                    <li><span class="notion" data-notion="multi-pistes">Multi-pistes</span> : Chaque micro sur une piste séparée pour flexibilité au mixage.</li>
                    <li><span class="notion" data-notion="ms-stereo">MS (Mid-Side)</span> : Configuration stéréo avec contrôle de largeur en post.</li>
                    <li><span class="notion" data-notion="boom-vs-lav">Boom vs Lav</span> : Perche = naturel mais risqué / Cravate = sécurité mais moins naturel.</li>
                    <li><span class="notion" data-notion="plant-mic">Plant mic</span> : Micro caché dans le décor pour plans larges.</li>
                    <li><span class="notion" data-notion="wild-tracks">Wild tracks</span> : Enregistrements sonores sans image (ambiances, effets).</li>
                </ul>
                
                <h3>Le Sound Design</h3>
                <ul>
                    <li><span class="notion" data-notion="worldizing">Worldizing</span> : Rejouer un son dans un espace réel et le réenregistrer (Walter Murch).</li>
                    <li><span class="notion" data-notion="layering">Layering</span> : Superposer plusieurs sons pour en créer un nouveau.</li>
                    <li><span class="notion" data-notion="pitch-shifting">Pitch shifting</span> : Modifier la hauteur (ralentir un cri animal = monstre).</li>
                    <li><span class="notion" data-notion="sound-metaphor">Sound metaphor</span> : Son qui représente une idée (battement = tension).</li>
                    <li><span class="notion" data-notion="leitmotiv-sonore">Leitmotiv sonore</span> : Son récurrent associé à un personnage ou thème.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Piège fréquent :</strong> Trop de musique tue lémotion. Le silence avant un moment fort amplifie limpact.
                </div>
                
                <h3>Le Mixage - Équilibrer les Éléments</h3>
                <ul>
                    <li><span class="notion" data-notion="dialogues-son">Priorité dialogues</span> : Toujours intelligibles sauf choix artistique.</li>
                    <li><span class="notion" data-notion="ducking">Ducking</span> : Baisser automatiquement la musique sous les dialogues.</li>
                    <li><span class="notion" data-notion="panning">Panoramique (panning)</span> : Placer les sons dans lespace stéréo/surround.</li>
                    <li><span class="notion" data-notion="lfe">LFE (caisson de basses)</span> : Canal dédié aux basses fréquences (explosions, impacts).</li>
                    <li><span class="notion" data-notion="stems">Stems</span> : Groupes séparés (DX, MX, FX) pour versions internationales.</li>
                </ul>
                
                <h3>Formats Audio au Cinéma</h3>
                <ul>
                    <li><span class="notion" data-notion="formats-audio">Mono</span> : Un seul canal. Historique.</li>
                    <li><span class="notion" data-notion="formats-audio">Stéréo (2.0)</span> : Gauche/Droite. Standard minimal.</li>
                    <li><span class="notion" data-notion="surround-51">5.1 Surround</span> : 5 canaux + 1 LFE. Standard cinéma actuel.</li>
                    <li><span class="notion" data-notion="formats-audio">7.1</span> : Ajout de surrounds latéraux.</li>
                    <li><span class="notion" data-notion="dolby-atmos">Dolby Atmos</span> : Son objet, placement 3D précis, plafond.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Sound Design"</strong> - David Sonnenschein : Théorie et pratique du design sonore.</li>
                    <li><strong>"The Filmmaker Handbook"</strong> - Ascher & Pincus : Chapitre son très complet.</li>
                    <li><strong>"Audio-Vision"</strong> - Michel Chion (1990) : Théorie du son au cinéma, référence académique.</li>
                    <li><strong>"Sound for Film and Television"</strong> - Tomlinson Holman : Manuel technique.</li>
                    <li><strong>"Practical Art of Motion Picture Sound"</strong> - David Yewdall : Expérience de terrain.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Sound Design)</h3>
                <ul>
                    <li><strong>Apocalypse Now</strong> (Walter Murch, 1979) : Révolution du sound design, premier 5.1.</li>
                    <li><strong>Gravity</strong> (Glenn Freemantle, 2013) : Son dans le vide, vibrations par contact.</li>
                    <li><strong>A Quiet Place</strong> (2018) : Le silence comme tension, son subjectif.</li>
                    <li><strong>No Country for Old Men</strong> (Skip Lievsay, 2007) : Absence quasi-totale de musique.</li>
                    <li><strong>WALL-E</strong> (Ben Burtt, 2008) : Personnages définis par leurs sons.</li>
                    <li><strong>Dunkirk</strong> (Richard King, 2017) : Son immersif, Shepard tone.</li>
                </ul>
            </div>
        `,
        
        montage: `
            <div class="courses-section">
                <h2>✂️ Le Montage</h2>
                
                <h3>Les Types de Raccords</h3>
                <ul>
                    <li><span class="notion" data-notion="raccord-axe">Raccord dans l'axe</span> : Changement de valeur sur le même axe (PE → GP).</li>
                    <li><span class="notion" data-notion="raccord-regard">Raccord regard</span> : On montre ce que voit le personnage.</li>
                    <li><span class="notion" data-notion="raccord-mouvement">Raccord mouvement</span> : Coupe pendant une action pour fluidifier.</li>
                    <li><span class="notion" data-notion="champ-contrechamp">Champ/Contre-champ</span> : Alternance entre deux personnages qui dialoguent.</li>
                    <li><span class="notion" data-notion="match-cut">Match cut</span> : Raccord sur une forme ou mouvement similaire.</li>
                </ul>
                
                <h3>Erreurs à Éviter</h3>
                <ul>
                    <li><span class="notion" data-notion="jump-cut">Jump cut</span> : Saute dans le temps sur le même plan (sauf effet voulu).</li>
                    <li><span class="notion" data-notion="franchissement-axe">Franchissement d'axe</span> : Passer de l'autre côté de la ligne des 180°.</li>
                    <li><span class="notion" data-notion="faux-raccord">Faux raccord</span> : Incohérence d'accessoire, position, lumière entre deux plans.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Règle du 30°</strong> : Entre deux plans de la même scène, changez l'angle d'au moins 30° pour éviter le jump cut.
                </div>
                
                <h3>Le Rythme</h3>
                <ul>
                    <li>Coupez sur l'<strong>action</strong>, pas avant ni après.</li>
                    <li>Laissez les plans <strong>respirer</strong> - ne coupez pas trop vite.</li>
                    <li>Le rythme suit l'<strong>émotion</strong> : rapide = tension, lent = contemplation.</li>
                    <li>Utilisez les <strong>réactions</strong> autant que les actions.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Les Théories du Montage</h3>
                <p>Le montage nest pas quune technique, cest un langage avec ses théoriciens :</p>
                <ul>
                    <li><span class="notion" data-notion="effet-koulechov">Effet Koulechov</span> : Un même visage neutre + images différentes = émotions différentes perçues. Le montage crée le sens.</li>
                    <li><span class="notion" data-notion="montage-intellectuel">Montage intellectuel (Eisenstein)</span> : La collision de deux plans crée une idée nouvelle (thèse + antithèse = synthèse).</li>
                    <li><span class="notion" data-notion="montage-invisible">Montage invisible (Hollywood classique)</span> : Coupes fluides, le spectateur oublie quil regarde un film.</li>
                    <li><span class="notion" data-notion="montage-visible">Montage visible (Godard, Nouvelle Vague)</span> : Jump cuts assumés, rappel constant du médium.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Citation :</strong> "Le cinéma, cest 24 fois la vérité par seconde" - Jean-Luc Godard. Mais le montage choisit quelles vérités.
                </div>
                
                <h3>Les 5 Types de Montage selon Eisenstein</h3>
                <ul>
                    <li><span class="notion" data-notion="montage-metrique">Métrique</span> : Coupe à intervalles réguliers, indépendamment du contenu. Crée un rythme mécanique.</li>
                    <li><span class="notion" data-notion="montage-rythmique">Rythmique</span> : Coupe selon le mouvement dans le plan. Le contenu dicte le rythme.</li>
                    <li><span class="notion" data-notion="montage-tonal">Tonal</span> : Coupe selon lémotion dominante du plan (lumière, atmosphère).</li>
                    <li><strong>Harmonique</strong> : Combinaison de tous les éléments (rythme, ton, mouvement).</li>
                    <li><span class="notion" data-notion="montage-intellectuel">Intellectuel</span> : Juxtaposition pour créer une métaphore ou une idée abstraite.</li>
                </ul>
                
                <h3>Techniques de Montage Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="montage-parallele">Montage parallèle (cross-cutting)</span> : Alterner entre deux actions simultanées. Tension, comparaison.</li>
                    <li><span class="notion" data-notion="montage-alterne">Montage alterné</span> : Deux temporalités différentes entrelacées.</li>
                    <li><span class="notion" data-notion="flashback">Flashback / Flash-forward</span> : Rupture temporelle vers le passé ou le futur.</li>
                    <li><span class="notion" data-notion="ellipse">Ellipse</span> : Saut dans le temps. Économie narrative.</li>
                    <li><span class="notion" data-notion="sequence-montage">Séquence de montage</span> : Condensation du temps (entraînement, transformation).</li>
                    <li><span class="notion" data-notion="split-screen">Split screen</span> : Écran divisé, actions simultanées visibles.</li>
                    <li><span class="notion" data-notion="smash-cut">Smash cut</span> : Coupe brutale et inattendue pour effet de choc.</li>
                    <li><span class="notion" data-notion="l-cut-j-cut">L-cut / J-cut</span> : Le son précède ou suit limage. Fluidité, anticipation.</li>
                </ul>
                
                <h3>Le Workflow de Post-production</h3>
                <ul>
                    <li><strong>Synchro/Dérushage</strong> : Synchroniser son et image, organiser les médias.</li>
                    <li><span class="notion" data-notion="bout-a-bout">Bout-à-bout</span> : Premier assemblage chronologique des prises retenues.</li>
                    <li><span class="notion" data-notion="rough-cut">Ours (rough cut)</span> : Premier montage complet, encore long.</li>
                    <li><span class="notion" data-notion="fine-cut">Fine cut</span> : Montage affiné, rythme ajusté.</li>
                    <li><span class="notion" data-notion="picture-lock">Picture lock</span> : Montage image validé, plus de modifications.</li>
                    <li><strong>Conformation</strong> : Remplacement des proxies par les fichiers haute qualité.</li>
                    <li><span class="notion" data-notion="etalonnage">Étalonnage</span> : Correction colorimétrique et création du look.</li>
                    <li><strong>Mixage</strong> : Équilibrage final de toutes les pistes audio.</li>
                    <li><strong>Mastering</strong> : Export final dans les formats de diffusion.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Kill your darlings :</strong> Parfois les meilleures scènes doivent être coupées pour le bien du film. Le monteur doit être objectif.
                </div>
                
                <h3>Psychologie du Montage</h3>
                <ul>
                    <li><strong>Point de coupe idéal</strong> : Souvent sur un clignement dyeux ou un mouvement de tête.</li>
                    <li><strong>Regard du spectateur</strong> : Guider lœil dun plan à lautre (eye trace).</li>
                    <li><strong>Règle des 6 (Walter Murch)</strong> : Émotion (51%) > Histoire (23%) > Rythme (10%) > Eye trace (7%) > Planéité 2D (5%) > Espace 3D (4%).</li>
                    <li><strong>Durée des plans</strong> : Plus le plan est complexe visuellement, plus il peut durer.</li>
                </ul>
                
                <h3>Outils et Logiciels</h3>
                <ul>
                    <li><strong>Adobe Premiere Pro</strong> : Standard industrie, intégration Creative Cloud.</li>
                    <li><strong>DaVinci Resolve</strong> : Gratuit et pro, excellent étalonnage intégré.</li>
                    <li><strong>Final Cut Pro X</strong> : Écosystème Apple, timeline magnétique.</li>
                    <li><strong>Avid Media Composer</strong> : Standard cinéma/TV haut de gamme.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"In the Blink of an Eye"</strong> - Walter Murch (2001) : Philosophie du montage par un maître.</li>
                    <li><strong>"The Technique of Film Editing"</strong> - Karel Reisz (1953) : Classique technique britannique.</li>
                    <li><strong>"Film Editing: Theory and Practice"</strong> - Christopher Llewellyn Reed : Manuel contemporain.</li>
                    <li><strong>"The Conversations"</strong> - Michael Ondaatje & Walter Murch : Dialogue fascinant sur le métier.</li>
                    <li><strong>"Cut by Cut"</strong> - Gael Chandler : Guide pratique moderne.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Montage)</h3>
                <ul>
                    <li><strong>Le Cuirassé Potemkine</strong> (Eisenstein, 1925) : Escalier dOdessa, montage intellectuel.</li>
                    <li><strong>À bout de souffle</strong> (Godard, 1960) : Jump cuts révolutionnaires.</li>
                    <li><strong>Apocalypse Now</strong> (Walter Murch, 1979) : Montage et son visionnaires.</li>
                    <li><strong>Requiem for a Dream</strong> (2000) : Montage hip-hop, split screens.</li>
                    <li><strong>Mad Max: Fury Road</strong> (2015) : Centre du cadre constant, rythme effréné.</li>
                    <li><strong>Whiplash</strong> (2014) : Montage musical, tension rythmique.</li>
                </ul>
            </div>
        `,
        
        production: `
            <div class="courses-section">
                <h2>💼 La Production</h2>
                
                <h3>Les Étapes d'un Film</h3>
                <ul>
                    <li><span class="notion" data-notion="developpement">Développement</span> : Écriture, recherche de financements, montage du projet.</li>
                    <li><span class="notion" data-notion="pre-production">Pré-production</span> : Casting, repérages, planning, constitution de l'équipe.</li>
                    <li><span class="notion" data-notion="production-tournage">Production (tournage)</span> : Réalisation effective du film.</li>
                    <li><span class="notion" data-notion="post-production">Post-production</span> : Montage, étalonnage, mixage, VFX.</li>
                    <li><span class="notion" data-notion="distribution">Distribution</span> : Festivals, vente, diffusion.</li>
                </ul>
                
                <h3>Documents Essentiels</h3>
                <ul>
                    <li><span class="notion" data-notion="plan-travail">Plan de travail</span> : Calendrier détaillé du tournage jour par jour.</li>
                    <li><span class="notion" data-notion="feuille-service">Feuille de service</span> : Programme quotidien (horaires, lieux, scènes, équipe).</li>
                    <li><span class="notion" data-notion="depouillement">Dépouillement</span> : Liste des besoins par scène (décors, costumes, accessoires).</li>
                    <li><span class="notion" data-notion="budget-film">Budget</span> : Estimation détaillée des coûts.</li>
                    <li><span class="notion" data-notion="contrats-film">Contrats</span> : Engagements avec l'équipe et les comédiens.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Ordre de tournage :</strong> On ne tourne pas dans l'ordre du scénario ! On regroupe par lieu, disponibilité des acteurs, et conditions (jour/nuit).
                </div>
                
                <h3>Postes Clés</h3>
                <ul>
                    <li><span class="notion" data-notion="producteur">Producteur</span> : Finance et supervise l'ensemble du projet.</li>
                    <li><span class="notion" data-notion="directeur-production">Directeur de production</span> : Gère le budget et la logistique.</li>
                    <li><span class="notion" data-notion="premier-assistant">1er assistant réalisateur</span> : Organise le tournage, gère le planning.</li>
                    <li><span class="notion" data-notion="regisseur">Régisseur</span> : Logistique quotidienne (lieux, repas, transport).</li>
                    <li><span class="notion" data-notion="scripte">Scripte</span> : Garant de la continuité entre les plans.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Organigramme Complet dun Tournage</h3>
                <p><strong>Département Réalisation :</strong></p>
                <ul>
                    <li><strong>Réalisateur</strong> : Vision artistique, direction des acteurs et de léquipe.</li>
                    <li><strong>1er Assistant Réalisateur</strong> : Planning, organisation plateau, annonces.</li>
                    <li><strong>2ème Assistant Réalisateur</strong> : Feuilles de service, coordination comédiens.</li>
                    <li><strong>3ème Assistant / Stagiaire</strong> : Appui logistique, clap.</li>
                    <li><strong>Scripte</strong> : Continuité, raccords, chronométrage, rapport image.</li>
                </ul>
                
                <p><strong>Département Image :</strong></p>
                <ul>
                    <li><span class="notion" data-notion="chef-op">Directeur de la Photographie (Chef Op)</span> : Éclairage, cadre, look.</li>
                    <li><strong>Cadreur</strong> : Opère la caméra selon les directives.</li>
                    <li><strong>1er Assistant Caméra (Pointeur)</strong> : Mise au point, gestion optiques.</li>
                    <li><strong>2ème Assistant Caméra</strong> : Clap, rapport caméra, médias.</li>
                    <li><strong>Chef Électricien</strong> : Installation et réglage des éclairages.</li>
                    <li><strong>Chef Machiniste</strong> : Mouvements de caméra, grip.</li>
                    <li><strong>DIT (Digital Imaging Technician)</strong> : Gestion des médias, backups, LUTs.</li>
                </ul>
                
                <p><strong>Département Son :</strong></p>
                <ul>
                    <li><strong>Chef Opérateur Son</strong> : Mixage plateau, choix des micros.</li>
                    <li><strong>Perchiste</strong> : Manipulation de la perche.</li>
                </ul>
                
                <p><strong>Département Artistique :</strong></p>
                <ul>
                    <li><strong>Chef Décorateur</strong> : Conception et réalisation des décors.</li>
                    <li><strong>Accessoiriste</strong> : Objets manipulés par les acteurs.</li>
                    <li><strong>Chef Costumier</strong> : Conception et gestion des costumes.</li>
                    <li><strong>Habilleur</strong> : Aide les comédiens, entretien costumes.</li>
                    <li><strong>Chef Maquilleur</strong> : Maquillage beauté et effets.</li>
                    <li><strong>Chef Coiffeur</strong> : Coiffures et perruques.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Hiérarchie :</strong> Sur un plateau, on sadresse toujours au chef de département, jamais directement à son équipe (sauf urgence).
                </div>
                
                <h3>Le Financement en France</h3>
                <ul>
                    <li><strong>Apport producteur</strong> : Fonds propres de la société de production.</li>
                    <li><strong>Avance sur recettes (CNC)</strong> : Aide sélective sur scénario et réalisateur.</li>
                    <li><strong>Aides régionales</strong> : Fonds des régions (tournage local requis).</li>
                    <li><strong>SOFICA</strong> : Sociétés dinvestissement défiscalisées.</li>
                    <li><strong>Crédit dimpôt cinéma</strong> : 30% des dépenses françaises éligibles.</li>
                    <li><strong>Préventes TV</strong> : Chaînes qui préachètent les droits de diffusion.</li>
                    <li><strong>Minimum garanti distributeur</strong> : Avance du distributeur salle.</li>
                    <li><strong>Coproduction internationale</strong> : Partenaires étrangers (accès à leurs aides).</li>
                    <li><strong>Crowdfunding</strong> : Financement participatif (courts-métrages, documentaires).</li>
                </ul>
                
                <h3>Les Conventions Collectives</h3>
                <ul>
                    <li><strong>Convention Production Cinéma</strong> : Salaires minimums, heures supplémentaires.</li>
                    <li><strong>Convention Production Audiovisuelle</strong> : TV, publicité, clips.</li>
                    <li><strong>Heures de travail</strong> : Base 8h/jour, 39h/semaine. Au-delà = heures sup majorées.</li>
                    <li><strong>Repos</strong> : 11h minimum entre deux journées de travail.</li>
                    <li><strong>Repas</strong> : Obligatoires, max 6h entre deux repas.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Assurances obligatoires :</strong> Responsabilité civile, accidents du travail, matériel, négatif/médias, interruption de tournage.
                </div>
                
                <h3>Gestion du Budget</h3>
                <ul>
                    <li><span class="notion" data-notion="above-below-line">Above the line</span> : Droits, scénario, réalisateur, acteurs principaux (coûts créatifs).</li>
                    <li><span class="notion" data-notion="above-below-line">Below the line</span> : Équipe technique, matériel, décors, post-prod (coûts de fabrication).</li>
                    <li><strong>Contingence</strong> : Réserve de 5-10% pour imprévus.</li>
                    <li><strong>Frais généraux</strong> : 5-7% pour la structure de production.</li>
                    <li><strong>Completion bond</strong> : Garantie de bonne fin (gros budgets).</li>
                </ul>
                
                <h3>Le Plan de Travail - Principes dOptimisation</h3>
                <ul>
                    <li><strong>Regrouper par décor</strong> : Minimiser les déménagements.</li>
                    <li><strong>Disponibilité acteurs</strong> : Concentrer les scènes dun même comédien.</li>
                    <li><strong>Jour/Nuit</strong> : Regrouper les nuits (éviter alternances épuisantes).</li>
                    <li><strong>Ordre de difficulté</strong> : Scènes complexes en milieu de tournage (équipe rodée).</li>
                    <li><strong>Météo</strong> : Prévoir des scènes de repli en intérieur.</li>
                    <li><strong>Enfants</strong> : Restrictions horaires légales strictes.</li>
                </ul>
                
                <h3>Distribution et Exploitation</h3>
                <ul>
                    <li><strong>Agent de ventes (Sales Agent)</strong> : Vend le film à linternational.</li>
                    <li><strong>Distributeur</strong> : Commercialise le film sur un territoire.</li>
                    <li><strong>Exploitant</strong> : Propriétaire des salles de cinéma.</li>
                    <li><strong>Chronologie des médias</strong> : Salle → VOD → TV payante → TV gratuite → SVOD.</li>
                    <li><strong>P&A (Prints and Advertising)</strong> : Budget copies et publicité.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Producing for the Screen"</strong> - Kathi Lipman : Guide pratique de production.</li>
                    <li><strong>"The Independent Film Producers Survival Guide"</strong> - Gunnar Erickson : Juridique et financier.</li>
                    <li><strong>"Film Production Management"</strong> - Bastian Cleve : Organisation et logistique.</li>
                    <li><strong>"Le Guide du producteur"</strong> - CNC : Référence française (téléchargeable).</li>
                    <li><strong>"Movie Money"</strong> - Bill Daniels : Comprendre léconomie du cinéma.</li>
                </ul>
                
                <h3>🔗 Ressources Utiles</h3>
                <ul>
                    <li><strong>CNC (cnc.fr)</strong> : Aides, réglementations, statistiques France.</li>
                    <li><strong>Film France</strong> : Commission du film nationale, autorisations.</li>
                    <li><strong>Commissions du film régionales</strong> : Aides locales, repérages.</li>
                    <li><strong>CST (Commission Supérieure Technique)</strong> : Normes techniques.</li>
                    <li><strong>SACD / SCAM</strong> : Droits dauteur scénaristes/réalisateurs.</li>
                </ul>
            </div>
        `,
        
        glossaire: `
            <div class="courses-section">
                <h2>📖 Glossaire du Cinéma</h2>
                
                <div class="courses-term"><dt>Axe</dt><dd>Direction dans laquelle la caméra regarde le sujet.</dd></div>
                <div class="courses-term"><dt>Champ</dt><dd>Ce qui est visible dans le cadre.</dd></div>
                <div class="courses-term"><dt>Hors-champ</dt><dd>Ce qui est en dehors du cadre mais fait partie de la scène.</dd></div>
                <div class="courses-term"><dt>Diégèse</dt><dd>L'univers fictif du film, tout ce qui "existe" dans l'histoire.</dd></div>
                <div class="courses-term"><dt>Diégétique</dt><dd>Son ou musique dont la source est dans l'univers du film (radio, personnage qui chante).</dd></div>
                <div class="courses-term"><dt>Extra-diégétique</dt><dd>Son ajouté (musique de film, voix-off narrative).</dd></div>
                <div class="courses-term"><dt>Clap</dt><dd>Ardoise identifiant chaque prise. Le claquement permet la synchronisation son/image.</dd></div>
                <div class="courses-term"><dt>Rushes</dt><dd>Images brutes tournées, non montées.</dd></div>
                <div class="courses-term"><dt>Bout-à-bout</dt><dd>Premier assemblage chronologique des rushes sélectionnés.</dd></div>
                <div class="courses-term"><dt>Ours</dt><dd>Premier montage complet mais non finalisé.</dd></div>
                <div class="courses-term"><dt>Étalonnage</dt><dd>Correction colorimétrique pour harmoniser l'image et créer une ambiance.</dd></div>
                <div class="courses-term"><dt>Mixage</dt><dd>Équilibrage final de toutes les pistes audio.</dd></div>
                <div class="courses-term"><dt>DCP</dt><dd>Digital Cinema Package - Format de diffusion en salle.</dd></div>
                <div class="courses-term"><dt>Ratio</dt><dd>Rapport largeur/hauteur de l'image (1.85:1, 2.39:1 Scope, 16:9...).</dd></div>
                <div class="courses-term"><dt>Amorce</dt><dd>Partie d'un personnage ou objet au premier plan, partiellement visible.</dd></div>
                <div class="courses-term"><dt>Insert</dt><dd>Gros plan sur un détail significatif (objet, main, texte).</dd></div>
                <div class="courses-term"><dt>Plan-séquence</dt><dd>Scène tournée en un seul plan sans coupe.</dd></div>
                <div class="courses-term"><dt>Raccord</dt><dd>Cohérence visuelle et sonore entre deux plans consécutifs.</dd></div>
            </div>
        `
    })
};
