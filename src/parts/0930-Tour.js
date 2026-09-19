
  const Tour = {
    _active: false,
    _steps: [],
    _idx: 0,
    _els: {},
    _onReflow: null,
    _onKey: null,
    _openedMenu: null,
    DONE_KEY: 'moteur_tour_done',

    chapters: {
      general: {
        titre: 'Orientation generale',
        desc: "Les grands reperes de Moteur : ton espace, la communaute, l'aide et tes projets.",
        available: function () { return !state.currentProjectId; },
        unavailable: "Cette visite se lance depuis l'accueil (ferme le projet pour y revenir).",
        steps: [
          {
            title: 'Bienvenue sur Moteur',
            body: "Petit tour rapide pour ne pas etre perdu. Tu peux quitter a tout moment (touche Echap) et le relancer depuis le menu Aide.",
            target: null
          },
          {
            title: 'Mon Espace',
            body: "Ton profil public et ton carnet de contacts. Commence par creer ton profil : c'est obligatoire pour pouvoir creer un projet (et pour apparaitre dans l'Univers).",
            target: function () {
              var d = Tour._navDropdown(0);
              return d ? [d.querySelector('.hub-nav-btn'), d.querySelector('.dropdown-menu')] : [];
            },
            onEnter: function () { Tour._openMenu(0); }
          },
          {
            title: 'Communaute',
            body: "L'Univers : la carte des projets et profils publics. Tu peux y rechercher comediens, techniciens et associations, et laisser le matching te proposer des projets faits pour toi. Le Forum sert aux echanges.",
            target: function () {
              var d = Tour._navDropdown(1);
              return d ? [d.querySelector('.hub-nav-btn'), d.querySelector('.dropdown-menu')] : [];
            },
            onEnter: function () { Tour._openMenu(1); }
          },
          {
            title: 'Aide',
            body: "Les cours, le guide complet, et cette visite guidee (que tu pourras relancer ici).",
            target: function () {
              var d = Tour._navDropdown(2);
              return d ? [d.querySelector('.hub-nav-btn'), d.querySelector('.dropdown-menu')] : [];
            },
            onEnter: function () { Tour._openMenu(2); }
          },
          {
            title: 'Tes projets',
            body: "C'est ici que tu crees et retrouves tes films. Tu peux les trier et les partager avec ton equipe (comediens, equipe, invites). Lance-toi avec un nouveau projet quand tu es pret.",
            target: '#hub-content'
          }
        ]
      },
      synopsis: {
        tab: 'synopsis',
        titre: 'Synopsis et resumes',
        desc: "Les textes qui racontent ton film : synopsis, resume court, resume long, avec mise en forme et export PDF.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Synopsis.",
        steps: [
          {
            title: 'Synopsis et resumes',
            body: "Cet onglet regroupe les textes de presentation de ton film. Ils servent de base a ton dossier, a l'Univers et aux candidatures (festivals, aides, CNC).",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('synopsis'); } catch (e) {} }
          },
          {
            title: 'Trois textes',
            body: "A gauche, tu bascules entre Synopsis, Resume court et Resume long. Le compteur de signes affiche sous chaque entree t'aide a tenir les formats imposes par les dossiers.",
            target: '.synopsis-sidebar'
          },
          {
            title: 'Mise en forme',
            body: "Gras, italique, listes : structure ton texte directement. La mise en forme est conservee a l'impression et a l'export PDF.",
            target: '#synopsisToolbar'
          },
          {
            title: 'Export PDF',
            body: "Genere un PDF propre de tes resumes, pret a glisser dans un dossier de production ou a envoyer.",
            target: '[onclick*="openSynopsisPdfModal"]'
          }
        ]
      },
      board: {
        tab: 'board',
        titre: 'Sequencier',
        desc: "La vue d'ensemble de la structure : sequences en liste (Sequencier) ou cartes a deplacer (BeatBoard).",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Sequencier.",
        steps: [
          {
            title: 'Le sequencier',
            body: "Ici tu vois la structure de ton film sequence par sequence, sans entrer dans le detail des dialogues. C'est ta vue d'ensemble du recit.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('board'); } catch (e) {} }
          },
          {
            title: 'Creer une scene',
            body: "Le bouton Ajouter Scene cree une sequence vide et ouvre sa fiche : tu y saisis INT./EXT., le lieu, JOUR ou NUIT, la duree, les personnages et le resume. Tout s'enregistre au fil de la frappe.",
            target: '#board-add-row'
          },
          {
            title: 'Deux modes',
            body: "Sequencier : une liste structuree de tes sequences. BeatBoard : les memes elements en cartes libres, facon tableau, pour reflechir au rythme et reordonner d'un coup d'oeil.",
            target: function () {
              return [document.getElementById('view-mode-sequencer'), document.getElementById('view-mode-beatboard')].filter(Boolean);
            }
          },
          {
            title: 'Affichage',
            body: "Le panneau lateral regle ce qui apparait dans le sequencier : mode normal ou compact, et l'affichage du synopsis et des resumes a cote de chaque sequence.",
            target: '.board-sidebar'
          },
          {
            title: 'Export PDF',
            body: "Exporte ton sequencier en PDF pour le partager avec ton equipe ou l'imprimer.",
            target: '#btn-sequencer-pdf'
          }
        ]
      },
      titlepage: {
        tab: 'titlepage',
        titre: 'Page de titre',
        desc: "La page de garde de ton scenario : titre, auteurs, contact, mentions legales, export PDF.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Titre.",
        steps: [
          {
            title: 'La page de titre',
            body: "C'est la premiere page de ton scenario, celle qu'on lit en ouvrant un dossier ou une lecture. Elle pose le titre, les auteurs et les mentions.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('titlepage'); } catch (e) {} }
          },
          {
            title: 'Les informations cles',
            body: "Titre, auteur et co-auteur, contact, version (draft), date, source en cas d'adaptation, copyright et notes. Remplis ce qui s'applique : les champs laisses vides ne s'affichent pas sur la page.",
            target: function () {
              return [document.getElementById('tp-title'), document.getElementById('tp-notes')].filter(Boolean);
            }
          },
          {
            title: 'Export PDF',
            body: "Genere la page de titre en PDF, dans la mise en page standard d'un scenario.",
            target: '[onclick*="TitlePage.exportPDF"]'
          }
        ]
      },
      script: {
        tab: 'script',
        titre: 'Scenario',
        desc: "L'editeur de scenario au format standard : script continu, mise en forme, reglages et export pro.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Scenario.",
        steps: [
          {
            title: "L'editeur de scenario",
            body: "C'est ici que tu ecris au format standard, en continu : la mise en forme (Action, Perso, Dialogue...) suit automatiquement pendant que tu tapes.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('script'); } catch (e) {} }
          },
          {
            title: 'Ajouter une scene',
            body: "Le bouton + (entre Note et l'engrenage) insere une nouvelle scene juste apres celle ou tu ecris. Raccourci clavier : Maj+Espace.",
            target: function () {
              var bar = document.getElementById('continuous-toolbar');
              return bar ? Array.prototype.slice.call(bar.querySelectorAll('.fmt-btn-prefs')).slice(0, 1) : [];
            }
          },
          {
            title: "Ta zone d'ecriture",
            body: "C'est ici que tu tapes : tu ecris d'affilee, comme un vrai scenario, et la mise en forme suit.",
            target: '#scriptContinuousContainer'
          },
          {
            title: 'Mise en forme',
            body: "Action, Perso, Dial, Didascalie, Transition, Centre, Note : le type de chaque ligne. Astuce : Tab et Entree enchainent les formats automatiquement pendant que tu ecris.",
            target: '#continuous-toolbar'
          },
          {
            title: 'Reglages et export',
            body: "L'engrenage regle le comportement de Tab et Entree. Le bouton PDF exporte ton scenario en mise en page pro (Final Draft / Courier Prime).",
            target: function () {
              var bar = document.getElementById('continuous-toolbar');
              return bar ? Array.prototype.slice.call(bar.querySelectorAll('.fmt-btn-prefs')).slice(1) : [];
            }
          }
        ]
      },
      moodboard: {
        tab: 'moodboard',
        titre: 'Mood Board',
        desc: "Tes planches d'ambiance : images, couleurs et textes sur un canvas libre, exportables en PNG ou PDF.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Mood Board.",
        steps: [
          {
            title: 'Le mood board',
            body: "Il sert a poser l'ambiance visuelle de ton film : references d'images, palette de couleurs, textures, intentions de mise en scene.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('moodboard'); } catch (e) {} }
          },
          {
            title: 'Creer et exporter',
            body: "Cree une nouvelle planche, choisis son format (A4, A3, paysage ou portrait), puis exporte en PNG ou PDF. Le bouton Infos affiche le detail de la planche.",
            target: '.moodboard-toolbar'
          },
          {
            title: 'Le canvas',
            body: "C'est ta surface de travail. Clic droit sur le canvas pour ajouter une image, un texte ou une forme, puis deplace et redimensionne librement. Zoom en bas a droite, vue d'ensemble en bas a gauche : clique dedans pour te deplacer sur la planche.",
            target: '#moodboardCanvas'
          },
          {
            title: 'Tes planches',
            body: "Tu peux avoir plusieurs planches dans un projet (par sequence, par decor, par personnage). Elles se retrouvent toutes dans cette liste.",
            target: '#moodboardBoardsList'
          }
        ]
      },
      // ================================================================
      // MON ESPACE ET COMMUNAUTE — les quatre ecrans du hub. Ils ne sont
      // pas des onglets de projet mais des vues ouvertes par les menus
      // deroulants du bandeau : d'ou l'absence de propriete tab (le bouton
      // « Onglet en cours » ne les concerne pas) et l'ouverture explicite
      // dans onEnter.
      // ================================================================
      profile: {
        titre: 'Mon Profil',
        desc: "Ta fiche publique : ce que les autres voient de toi dans l'Univers.",
        available: function () { return !state.currentProjectId; },
        unavailable: "Cette visite se lance depuis l'accueil (ferme le projet pour y revenir).",
        steps: [
          {
            title: 'Ton profil public',
            body: "C'est ta carte de visite sur Moteur. Elle est obligatoire pour creer un projet, et c'est elle qui te rend visible dans l'Univers.",
            target: '#profile-content',
            onEnter: function () { try { Admin.close(); PublicProfile.open(); } catch (e) {} }
          },
          {
            title: 'Tu peux avoir plusieurs casquettes',
            body: "Comedien, technicien, association, entreprise. Coche celles qui te correspondent : on est souvent plusieurs choses a la fois sur un tournage.",
            target: '#profile-all-sections'
          },
          {
            title: 'Visible ou non',
            body: "Chaque casquette a son propre interrupteur de visibilite. Tu peux etre cherchable comme technicien sans l'etre comme comedien.",
            target: '#profile-status'
          },
          {
            title: 'Ce que ca declenche',
            body: "Une fois ton profil rempli, d'autres peuvent te trouver et t'inviter sur leurs projets. Et quand on t'ajoute a une equipe, tes informations arrivent deja remplies.",
            target: null
          }
        ]
      },
      contacts: {
        titre: 'Contacts',
        desc: "Ton carnet d'adresses : les gens avec qui tu travailles, d'un projet a l'autre.",
        available: function () { return !state.currentProjectId; },
        unavailable: "Cette visite se lance depuis l'accueil (ferme le projet pour y revenir).",
        steps: [
          {
            title: 'Ton carnet',
            body: "Les comediens et techniciens que tu gardes sous la main. Il te suit d'un projet a l'autre : tu ne resaisis pas la meme equipe a chaque film.",
            target: '#contacts-list',
            onEnter: function () { try { Admin.close(); Contacts.open(); } catch (e) {} }
          },
          {
            title: 'Favoris ou annuaire',
            body: "Mes Favoris : les gens que tu as retenus. Annuaire : tout le monde sur Moteur. Le second sert a trouver, le premier a retrouver.",
            target: '#contacts-sub-tabs'
          },
          {
            title: 'Filtrer',
            body: "Par metier, par role, par region. Utile quand tu cherches un chef operateur disponible pres de chez toi.",
            target: '#contacts-filters'
          }
        ]
      },
      universe: {
        titre: 'Univers',
        desc: "L'annuaire vivant de Moteur : trouver des comediens, des techniciens, des structures.",
        available: function () { return !state.currentProjectId; },
        unavailable: "Cette visite se lance depuis l'accueil (ferme le projet pour y revenir).",
        steps: [
          {
            title: "L'Univers",
            body: "Tous ceux qui ont rempli un profil public. C'est la que tu cherches quelqu'un quand ton carnet ne suffit pas.",
            target: '#universe-view',
            onEnter: function () { try { Universe.openFromMenu(); } catch (e) {} }
          },
          {
            title: 'Chercher pres de chez toi',
            body: "Type de profil, ville, distance. Sur un tournage sans budget, la proximite compte souvent plus que le reste.",
            target: '#universe-city'
          },
          {
            title: 'Des criteres precis',
            body: "Pour un comedien : age, taille, apparence. Pour un technicien : departement et poste. Les memes criteres que la recherche de casting de tes projets.",
            target: '#universe-type'
          },
          {
            title: 'Du profil au projet',
            body: "Depuis une fiche trouvee ici, tu peux inviter la personne sur un projet. Ses informations arrivent alors deja remplies dans ton casting ou ton equipe.",
            target: null
          }
        ]
      },
      forum: {
        titre: 'Forum',
        desc: "L'endroit pour poser une question, signaler un manque, ou parler du metier.",
        available: function () { return !Forum.suspended && !state.currentProjectId; },
        unavailable: "Le forum est temporairement suspendu.",
        steps: [
          {
            title: 'Le forum',
            body: "Un espace commun : entraide entre utilisateurs, questions de methode, discussions sur le metier.",
            target: '#forum-view',
            onEnter: function () { try { Forum.open(); } catch (e) {} }
          },
          {
            title: 'Des salons par sujet',
            body: "General, comediens, techniciens, plus un salon de retours par grande partie de l'outil. Poste au bon endroit : c'est la que les reponses arrivent le plus vite.",
            target: '#forum-view'
          },
          {
            title: 'Un bug ou une idee ?',
            body: "Pour un probleme precis ou une proposition, prefere la bulle 💡 en bas a gauche : elle me l'envoie directement avec le contexte technique. Le forum sert aux echanges entre vous.",
            target: '.feedback-bubble'
          }
        ]
      },

      // ================================================================
      // SYNTHESES ET ADMINISTRATION
      // ================================================================
      presentation: {
        tab: 'presentation',
        titre: 'Presentation du projet',
        desc: "La fiche d'identite du film : titre, affiche, genre, dates, lieu, equipe.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Presentation.",
        steps: [
          {
            title: 'La fiche du projet',
            body: "C'est la carte d'identite de ton film. Ce qui est saisi ici se retrouve sur la page de titre, le dossier de production, les feuilles de service et ta vitrine dans l'Univers.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('presentation'); } catch (e) {} }
          },
          {
            title: "L'affiche",
            body: "L'image du projet apparait sur ta grille de projets, sur le dossier et dans l'Univers. Un simple glisser-deposer suffit.",
            target: '#project-image-placeholder'
          },
          {
            title: 'Les dates',
            body: "Preparation, tournage, post-production, sortie. Elles bornent ton planning et servent au dossier de production.",
            target: '#project-vis-btn-dates'
          },
          {
            title: 'Le lieu',
            body: "Ville, region, pays. Ils servent a la meteo des feuilles de service et au reperage sur la carte.",
            target: '#project-vis-btn-location'
          }
        ]
      },
      stats: {
        tab: 'stats',
        titre: 'Statistiques',
        desc: "Ce que ton scenario dit de lui-meme : repartition, parite, temps, avancement.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Statistiques.",
        steps: [
          {
            title: 'Les statistiques',
            body: "Rien a saisir ici : tout est calcule a partir de ce que tu as deja fait ailleurs. C'est une lecture, pas une saisie.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('stats'); } catch (e) {} }
          },
          {
            title: 'Les compteurs',
            body: "Nombre de scenes, de dialogues, de plans, duree estimee, taille de l'equipe, budget. De quoi savoir ou tu en es d'un coup d'oeil.",
            target: '#stat-total-scenes'
          },
          {
            title: 'Les graphiques',
            body: "Interieur/exterieur, jour/nuit, parite des personnages et des dialogues. Utile pour un dossier de production ou une demande d'aide.",
            target: '#chart-int-ext'
          },
          {
            title: "L'avancement",
            body: "La barre de progression compare les scenes deja posees sur le planning au total. C'est ton indicateur de preparation.",
            target: '#progress-scenes-planned'
          }
        ]
      },
      scriptreport: {
        tab: 'scriptreport',
        titre: 'Rapport de script',
        desc: "Le document de la scripte : ce qui a reellement ete tourne, prise par prise.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Rapport de script.",
        steps: [
          {
            title: 'Le rapport de script',
            body: "C'est le seul onglet qui parle du tournage passe et non du tournage a venir. La scripte y consigne ce qui a ete tourne : plans, prises, ce qui est bon, ce qui est a refaire.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('scriptreport'); } catch (e) {} }
          },
          {
            title: 'Choisir la scene',
            body: "La liste reprend tes scenes. Choisis celle que tu viens de tourner : le rapport se prepare avec ses plans deja connus.",
            target: '#sr-scenes-list'
          },
          {
            title: 'La feuille',
            body: "Une ligne par prise, avec sa valeur, sa duree et l'appreciation. Ce document part au montage : c'est lui qui evite de revoir quatre heures de rushes pour retrouver la bonne prise.",
            target: '#sr-sheet-container'
          }
        ]
      },
      expenses: {
        tab: 'expenses',
        titre: 'Budget et depenses',
        desc: "Le budget du film, les depenses reelles, et le lien avec les fiches.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Depenses.",
        steps: [
          {
            title: 'Budget et depenses',
            body: "Deux choses distinctes : ce que tu as prevu de depenser, et ce que tu as reellement depense. L'onglet montre les deux et l'ecart entre eux.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('expenses'); } catch (e) {} }
          },
          {
            title: 'Simple ou detaille',
            body: "En mode simple, un budget global et des depenses. En mode detaille, des enveloppes par poste et le decoupage CNC. Commence simple, tu changeras plus tard si besoin.",
            target: '#expenses-mode-btn'
          },
          {
            title: 'Une depense pointe vers une fiche',
            body: "Chaque depense se rattache a UNE fiche : ce comedien, ce decor, cet accessoire. Une seule, jamais deux — sinon la meme somme serait comptee plusieurs fois.",
            target: '#expenses-pane-list'
          },
          {
            title: 'Le cout remonte tout seul',
            body: "Ce lien fait que le cout apparait aussi sur la fiche concernee. Tu sais ce que t'a coute un decor sans avoir a le calculer.",
            target: null
          },
          {
            title: 'Reglages du budget',
            body: "Devise, TVA, alertes de depassement, responsables par departement. Range derriere ce bouton parce qu'on y touche une fois, pas tous les jours.",
            target: '#expenses-sidebar-advanced'
          }
        ]
      },
      contracts: {
        tab: 'contracts',
        titre: 'Contrats',
        desc: "Generer et suivre les documents : autorisations, engagements, cessions de droits.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Contrats.",
        steps: [
          {
            title: 'Les contrats',
            body: "Meme un tournage benevole a besoin de papiers : autorisation de droit a l'image, accord de benevolat, autorisation de tournage. Ils se redigent ici.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('contracts'); } catch (e) {} }
          },
          {
            title: 'Les informations sont deja la',
            body: "Choisis une personne dans ton projet : nom, adresse et coordonnees viennent de sa fiche. Tu ne retapes que ce qui est propre au contrat.",
            target: '#contracts-hub'
          },
          {
            title: 'Mes contrats',
            body: "La liste de tout ce qui a ete genere sur le projet, avec l'etat de chacun. Export PDF, duplication, suppression.",
            target: '#ctr-viewbtn-list'
          }
        ]
      },

      // ================================================================
      // CASTING / DECORS — les familles de fiches. Toutes racontent la
      // meme histoire : ce qui est saisi ici ressort sur la feuille de
      // service sans etre ressaisi.
      // ================================================================
      chars: {
        tab: 'chars',
        titre: 'Personnages',
        desc: "Les roles ecrits dans le scenario, et le lien vers les comediens qui les incarnent.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Personnages.",
        steps: [
          {
            title: 'Les personnages',
            body: "Un personnage, c'est un role ecrit. Il existe des que le scenario le nomme. Il n'a pas encore de visage : c'est le comedien qui le lui donnera.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('chars'); } catch (e) {} }
          },
          {
            title: 'Une fiche par role',
            body: "Chaque carte est une fiche : age, description physique, arc narratif, notes de direction d'acteur. Clique sur une carte pour l'ouvrir.",
            target: '#charContainer'
          },
          {
            title: 'Le lien vers le comedien',
            body: "Sur la fiche, tu relies le personnage a un comedien. C'est le seul endroit ou tu le fais. Ensuite, partout ou le personnage joue, l'outil sait qui convoquer.",
            target: '#charContainer'
          },
          {
            title: 'Ce que ce lien declenche',
            body: "Les scenes du personnage deviennent les jours de travail du comedien, donc ses convocations sur les feuilles de service, donc son cout dans le budget. Un seul lien, trois consequences automatiques.",
            target: null
          }
        ]
      },
      actors: {
        tab: 'actors',
        titre: 'Comediens',
        desc: "Les personnes reelles : fiches, disponibilites, recherche par criteres physiques.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Comediens.",
        steps: [
          {
            title: 'Les comediens',
            body: "Les personnes reelles de ton film. Coordonnees, photos, disponibilites, contrat. Les figurants vivent ici aussi, dans le groupe Figuration.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('actors'); } catch (e) {} }
          },
          {
            title: 'Chercher par criteres',
            body: "Age, taille, cheveux, yeux, langues parlees, sports pratiques, permis de conduire. Utile quand tu cherches quelqu'un pour un role precis.",
            target: '#actor-filters'
          },
          {
            title: 'Les disponibilites',
            body: "Sur chaque fiche, note les periodes ou la personne n'est pas libre. Elles s'affichent ensuite par-dessus le calendrier du planning : plus de convocation impossible.",
            target: '#actorContainer'
          },
          {
            title: 'Ce qui ressort ailleurs',
            body: "Le nom, le telephone et l'heure de convocation d'un comedien apparaissent sur la feuille de service des jours ou son personnage joue. Rien a recopier.",
            target: null
          }
        ]
      },
      locs: {
        tab: 'locs',
        titre: 'Decors',
        desc: "Les lieux de tournage : adresse, contacts, autorisations, photos, carte.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Decors.",
        steps: [
          {
            title: 'Les decors',
            body: "Chaque lieu ou tu tournes devient une fiche : adresse, proprietaire, contact sur place, autorisation, parking, acces, photos de reperage.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('locs'); } catch (e) {} }
          },
          {
            title: 'Une fiche, une adresse',
            body: "L'adresse n'est saisie qu'ici. Elle remonte ensuite sur toutes les feuilles de service des jours tournes dans ce decor, et sur la carte du projet.",
            target: '#locContainer'
          },
          {
            title: 'Le lien avec les scenes',
            body: "Un decor sait quelles scenes s'y tournent, donc quels jours il est occupe. Si tu changes de lieu, tu corriges une fiche et tout suit.",
            target: null
          }
        ]
      },
      resources: {
        tab: 'resources',
        titre: 'Ressources',
        desc: "Accessoires, costumes, materiel, vehicules : tout ce qu'il faut apporter sur le plateau.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Ressources.",
        steps: [
          {
            title: 'Les ressources',
            body: "Tout ce qui n'est ni une personne ni un lieu : accessoires, costumes, maquillage, materiel technique, vehicules de jeu.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('resources'); } catch (e) {} }
          },
          {
            title: "D'ou viennent ces fiches",
            body: "La plupart naissent du depouillement, quand tu surlignes un objet dans le scenario. Tu peux aussi en creer directement ici : le materiel de production n'est jamais ecrit dans le texte.",
            target: '#resourcesContainer'
          },
          {
            title: 'Ce que porte une fiche',
            body: "Qui la fournit, ce qu'elle coute, si elle est louee ou achetee, dans quelles scenes elle apparait. Le cout remonte au budget, les scenes remontent aux feuilles de service.",
            target: '#resourcesContainer'
          }
        ]
      },
      crew: {
        tab: 'crew',
        titre: 'Equipe technique',
        desc: "Les techniciens, leurs postes, leurs disponibilites et les vehicules de production.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Equipe.",
        steps: [
          {
            title: "L'equipe technique",
            body: "Realisation, image, son, lumiere, regie, deco, HMC. Chaque poste est une fiche avec ses coordonnees et ses disponibilites.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('crew'); } catch (e) {} }
          },
          {
            title: 'La liste des postes',
            body: "Ajoute un technicien, choisis son departement et son poste. Le classement par departement se retrouve tel quel sur la feuille de service.",
            target: '#crewContainer'
          },
          {
            title: 'Les vehicules',
            body: "Les vehicules de production se gerent ici aussi : qui conduit, qui transporte quoi, capacite. Ils alimentent le tableau Transports de la feuille du jour.",
            target: '#vehiclesContainer'
          }
        ]
      },
      orgs: {
        tab: 'orgs',
        titre: 'Asso / Entreprises',
        desc: "Les structures partenaires : production, association, prestataires, lieux partenaires.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Asso / Entreprises.",
        steps: [
          {
            title: 'Les structures',
            body: "Une association, une societe de production, un prestataire, une mairie. Meme traitement qu'une personne : une fiche, des coordonnees, un role sur le projet.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('orgs'); } catch (e) {} }
          },
          {
            title: 'Fiche partagee, role local',
            body: "Une structure peut venir de l'Univers avec ses informations generales. La section « Sur ce projet » reste toujours modifiable : c'est ce que cette structure fait ici, et cela n'appartient qu'a ton projet.",
            target: '#orgs-list'
          }
        ]
      },

      // ================================================================
      // DEPOUILLEMENT ET PLANNING — les deux chapitres qui expliquent
      // le coeur du produit : une information saisie une fois devient une
      // FICHE, et cette fiche remplit la feuille de service toute seule.
      // Volontairement plus longs que les autres.
      // ================================================================
      breakdown: {
        tab: 'breakdown',
        titre: 'Depouillement',
        desc: "Le coeur de Moteur : transformer le texte du scenario en fiches reelles, qui remplissent ensuite tout le reste.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Depouillement.",
        steps: [
          {
            title: 'Le depouillement',
            body: "C'est l'etape ou un scenario devient un tournage. On relit chaque scene et on note tout ce qu'il faudra reunir pour la tourner : les decors, les accessoires, les costumes, les vehicules, les personnages.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('breakdown'); } catch (e) {} }
          },
          {
            title: 'Trois colonnes, trois roles',
            body: "A gauche : ou tu en es, la liste de tes scenes. Au milieu : ce que tu lis, le texte de la scene choisie. A droite : ce que tu en as tire, les fiches.",
            target: '.breakdown-layout'
          },
          {
            title: 'Surligner dans le texte',
            body: "Selectionne un mot dans le scenario, fais un clic droit, et choisis sa categorie. Un accessoire, un decor, un costume. C'est le geste central de tout l'outil.",
            target: '#breakdownScriptCol'
          },
          {
            title: "Ce n'est plus un mot, c'est une FICHE",
            body: "A cet instant, l'element existe pour de bon. Ce n'est plus du texte : c'est un objet avec son nom, son responsable, son cout, sa photo si tu veux. Et surtout, il sait dans quelles scenes il apparait.",
            target: '#bdRightContent'
          },
          {
            title: 'Deux accessoires du meme nom',
            body: "Les liens ne passent pas par le nom mais par l'identite de la fiche. Deux « telephone » dans deux scenes differentes peuvent donc etre deux objets distincts, ou le meme : c'est toi qui decides, et l'outil ne les confondra jamais.",
            target: '#bd-sort'
          },
          {
            title: 'Ajouter sans passer par le texte',
            body: "Tout ne s'ecrit pas dans le scenario. Le bouton + cree une fiche directement : un vehicule de production, un decor de repli, un accessoire ajoute en preparation.",
            target: '#bd-add-btn'
          },
          {
            title: 'Elements sans fiche',
            body: "Ce bouton liste ce que tu as surligne dans le texte mais qui ne pointe encore vers aucune fiche. C'est ton filet de securite avant le tournage : rien d'oublie, rien de flottant.",
            target: '#bd-audit-btn'
          },
          {
            title: 'Et ensuite ?',
            body: "Ces fiches ne restent pas ici. Des que tu poseras une scene sur une journee de tournage, tout ce qu'elle contient se retrouvera sur la feuille de service de ce jour-la, sans rien ressaisir. C'est l'objet de la visite du Planning.",
            target: null
          }
        ]
      },
      planning: {
        tab: 'planning',
        titre: 'Planning et feuille de service',
        desc: "Poser les journees de tournage, et voir la feuille de service se remplir toute seule a partir des fiches.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Planning.",
        steps: [
          {
            title: 'Le planning',
            body: "C'est ici que le film prend une date. Chaque journee de tournage recoit les scenes qu'on y tourne, et devient une feuille de service.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('planning'); } catch (e) {} }
          },
          {
            title: 'Trois facons de voir',
            body: "Calendrier pour poser les dates. Kanban pour suivre l'avancement scene par scene. Plan de travail pour la vue tableau classique du tournage.",
            target: function () {
              return [document.getElementById('planning-mode-calendar'), document.getElementById('planning-mode-kanban'), document.getElementById('planning-mode-workplan')].filter(Boolean);
            }
          },
          {
            title: 'Creer une journee',
            body: "Clique sur une case du calendrier pour creer une journee. Seules les journees de type Tournage sont numerotees J1, J2, J3 — dans l'ordre des dates, automatiquement, meme si tu en intercales une plus tard.",
            target: '#planningContainer'
          },
          {
            title: 'Poser les scenes du jour',
            body: "Dans la fiche de la journee, tu choisis les scenes tournees. Et c'est le seul geste que tu fais : tout le reste en decoule.",
            target: '#planningContainer'
          },
          {
            title: 'LA FEUILLE SE REMPLIT SEULE',
            body: "Le decor vient de la scene. Les comediens convoques viennent des personnages de ces scenes. Les accessoires et costumes viennent du depouillement. La meteo vient de la date et du lieu. Tu n'as ressaisi aucune de ces informations.",
            target: '#dropdown-planningdocs',
            onEnter: function () { Tour._openTabMenu('planningdocs'); }
          },
          {
            title: 'Une source unique',
            body: "La feuille de service LIT les fiches, elle ne les modifie jamais. Une erreur d'adresse se corrige dans la fiche du decor, une fois, et les douze feuilles concernees suivent. C'est la regle de tout l'outil.",
            target: '#dropdown-planningdocs',
            onEnter: function () { Tour._openTabMenu('planningdocs'); }
          },
          {
            title: 'Ce qui reste a ta main',
            body: "L'automatique ne decide pas tout. Heures de convocation, pick-up, HMC, transports, consignes individuelles, silhouettes et figuration : ces reglages se posent sur la feuille du jour, et eux seuls sont a toi.",
            target: null
          },
          {
            title: 'Disponibilites',
            body: "Affiche les indisponibilites de tes comediens et techniciens par-dessus le calendrier, pour ne pas convoquer quelqu'un un jour ou il ne peut pas venir.",
            target: '.planning-avail'
          },
          {
            title: 'Exporter',
            body: "Le menu Documents sort la feuille de service en PDF, le planning complet, ou un fichier .ICS a importer dans l'agenda de chacun.",
            target: '#dropdown-planningdocs',
            onEnter: function () { Tour._openTabMenu('planningdocs'); }
          }
        ]
      },
      storyboard: {
        tab: 'storyboard',
        titre: 'Storyboard',
        desc: "Le decoupage en plans dessines, scene par scene, avec calques techniques et export PDF.",
        available: function () { return !!state.currentProjectId; },
        unavailable: "Ouvre d'abord un projet : cette visite se passe dans l'onglet Storyboard.",
        steps: [
          {
            title: 'Le storyboard',
            body: "C'est ton film dessine plan par plan : chaque scene contient une suite de plans avec cadre, mouvement de camera et notes techniques.",
            target: null,
            onEnter: function () { try { if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('storyboard'); } catch (e) {} }
          },
          {
            title: 'Vues et export',
            body: "Bascule entre les modes d'affichage, passe en plein ecran pour presenter le storyboard, ou exporte-le en PDF.",
            target: '.sb-view-toggle'
          },
          {
            title: 'Scenes et plans',
            body: "A gauche tes scenes, a droite les plans de la scene selectionnee. Le bouton d'ajout cree un plan que tu peux ensuite dessiner, illustrer ou annoter.",
            target: '#sbScenesList'
          },
          {
            title: "Configuration d'impression",
            body: "Avant d'exporter, choisis la mise en page (standard, large ou compacte) et le calque technique a faire apparaitre : lumiere, camera ou comediens.",
            target: '.sb-print-config'
          }
        ]
      }
    },

    // ---- ONGLET EN COURS -> CHAPITRE CORRESPONDANT ----
    // Il n'existe aucune variable globale « onglet courant » dans l'application :
    // la seule source fiable est le DOM, l'onglet visible portant la classe active.
    // On se limite a #app-view : le hub a lui aussi des .tab-content.
    currentTabName: function () {
      var el = document.querySelector('#app-view .tab-content.active');
      if (!el || !el.id) return null;
      return el.id.indexOf('tab-') === 0 ? el.id.slice(4) : null;
    },
    // Chaque chapitre declare l'onglet qu'il decrit via sa propriete tab.
    chapterForTab: function (tabName) {
      if (!tabName) return null;
      for (var id in this.chapters) {
        if (this.chapters[id] && this.chapters[id].tab === tabName) return id;
      }
      return null;
    },
    startCurrentTab: function () {
      if (!state.currentProjectId) {
        if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Ouvre d'abord un projet.", 'info');
        return;
      }
      var cid = this.chapterForTab(this.currentTabName());
      if (!cid) {
        if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Pas encore de visite guidee pour cet onglet.", 'info');
        return;
      }
      this._closePanel();
      this.start(cid);
    },

    // ---- helpers ciblage nav ----
    _navDropdown: function (i) {
      var list = document.querySelectorAll('#dashboard-view .dash-header .nav-dropdown');
      return list[i] || null;
    },
    _openMenu: function (i) {
      var d = this._navDropdown(i);
      if (!d) return;
      var m = d.querySelector('.dropdown-menu');
      if (m) { m.classList.add('show'); this._openedMenu = m; }
    },
    _closeMenu: function () {
      if (this._openedMenu) { this._openedMenu.classList.remove('show'); this._openedMenu = null; }
      // Les menus deroulants DANS un projet (.menu-dropdown) sont un autre
      // systeme que ceux du hub (.dropdown-menu) : ils ne repondent pas a
      // la ligne ci-dessus, il faut les fermer explicitement.
      try {
        document.querySelectorAll('.menu-dropdown.visible').forEach(function (m) { m.classList.remove('visible'); });
      } catch (e) {}
    },

    // OUVRE un menu d'onglet — surtout pas UI.toggleMenuDropdown, qui BASCULE :
    // trois etapes d'affilee visant le meme menu l'ouvriraient, le fermeraient,
    // puis le rouvriraient.
    _openTabMenu: function (name) {
      var d = document.getElementById('dropdown-' + name);
      if (!d) return;
      try { if (typeof UITheme !== 'undefined' && UITheme.closeAllDropdowns) UITheme.closeAllDropdowns(); } catch (e) {}
      d.classList.add('visible');
    },

    // ---- CSS injecte une seule fois ----
    _ensureStyle: function () {
      if (document.getElementById('tour-styles')) return;
      var st = document.createElement('style');
      st.id = 'tour-styles';
      st.textContent = [
        '.tour-overlay{position:fixed;inset:0;z-index:var(--z-modal-top);pointer-events:auto;}',
        '.tour-hole{position:fixed;top:0;left:0;width:0;height:0;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);outline:2px solid #e94560;outline-offset:2px;transition:all .25s ease;pointer-events:none;}',
        '.tour-tooltip{position:fixed;z-index:var(--z-tooltip);max-width:330px;background:var(--panel-bg,#1e1e2a);color:var(--text-main,#fff);border:1px solid var(--border,#333);border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.5);font-size:.92rem;line-height:1.45;transition:top .2s ease,left .2s ease;}',
        '.tour-tooltip h4{margin:0 0 8px;font-size:1.05rem;}',
        '.tour-tooltip p{margin:0 0 14px;}',
        '.tour-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
        '.tour-count{font-size:.78rem;opacity:.6;white-space:nowrap;}',
        '.tour-btns{display:flex;gap:8px;}',
        '.tour-btns button{border:none;border-radius:6px;padding:7px 12px;font-weight:bold;cursor:pointer;font-size:.85rem;}',
        '.tour-skip{background:transparent;color:var(--text-main,#fff);opacity:.55;}',
        '.tour-prev{background:var(--border,#333);color:var(--text-main,#fff);}',
        '.tour-prev:disabled{opacity:.35;cursor:default;}',
        '.tour-next{background:linear-gradient(135deg,#e94560,#8b5cf6);color:#fff;}',
        '.tour-panel-ov{position:fixed;inset:0;z-index:var(--z-modal-top);background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;}',
        '.tour-panel{background:var(--panel-bg,#1e1e2a);color:var(--text-main,#fff);border:1px solid var(--border,#333);border-radius:12px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden;}',
        '.tour-panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border,#333);flex:none;}',
        '.tour-panel-head h3{margin:0;font-size:1.1rem;}',
        '.tour-panel-x{background:transparent;border:none;color:var(--text-main,#fff);font-size:1.5rem;line-height:1;cursor:pointer;opacity:.7;}',
        '.tour-panel-body{padding:10px 18px 18px;display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0;overflow-y:auto;}',
        '.tour-ch{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--border,#333);border-radius:8px;}',
        '.tour-ch-txt{display:flex;flex-direction:column;gap:3px;}',
        '.tour-ch-txt strong{font-size:.98rem;}',
        '.tour-ch-txt span{font-size:.82rem;opacity:.65;line-height:1.35;}',
        '.tour-ch-go{flex:none;border:none;border-radius:6px;padding:8px 14px;font-weight:bold;cursor:pointer;background:linear-gradient(135deg,#e94560,#8b5cf6);color:#fff;font-size:.85rem;}',
        '.tour-here{width:100%;border:none;border-radius:8px;padding:13px 14px;font-weight:bold;font-size:.95rem;cursor:pointer;background:linear-gradient(135deg,#e94560,#8b5cf6);color:#fff;margin-bottom:4px;}',
        '.tour-grp{display:flex;flex-direction:column;}',
        '.tour-grp-head{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:var(--highlight,#2a2a3a);color:var(--text-main,#fff);border:1px solid var(--border,#333);border-radius:8px;padding:11px 14px;font-size:.95rem;font-weight:bold;cursor:pointer;}',
        '.tour-chev{display:inline-block;transition:transform .18s ease;font-size:.8rem;opacity:.8;}',
        '.tour-grp.open > .tour-grp-head .tour-chev{transform:rotate(90deg);}',
        '.tour-grp-body{display:none;flex-direction:column;gap:10px;padding-left:14px;margin-top:10px;}',
        '.tour-grp.open > .tour-grp-body{display:flex;}',
        '.tour-grp-soon{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border:1px dashed var(--border,#333);border-radius:8px;opacity:.7;}',
        '.tour-grp-soon strong{font-size:.95rem;}',
        '.tour-soon{font-size:.8rem;font-style:italic;opacity:.7;white-space:nowrap;}',
        '@media(max-width:600px){.tour-tooltip{max-width:calc(100vw - 24px);}}'
      ].join('');
      document.head.appendChild(st);
    },

    // ---- persistance "deja vu" + auto-lancement 1er login ----
    seen: function () {
      try { return localStorage.getItem(this.DONE_KEY) === '1'; } catch (e) { return false; }
    },
    markSeen: function () {
      try {
        if (typeof PreferencesSync !== 'undefined' && PreferencesSync.save) PreferencesSync.save(this.DONE_KEY, '1');
        else localStorage.setItem(this.DONE_KEY, '1');
      } catch (e) {}
    },
    maybeAutoStart: function () {
      if (this.seen()) return;
      var dash = document.getElementById('dashboard-view');
      if (!dash || dash.style.display === 'none') return;
      if (!this._navDropdown(0)) return;
      this.markSeen();
      this.start('general');
    },

    // ---- panneau "Visites guidees" (chapitrage, menu Aide) ----
    menu: [
      { ch: 'general' },
      { grp: 'Mon Espace', items: [
        { ch: 'profile' }, { ch: 'contacts' }
      ] },
      { grp: 'Communaute', items: [
        { ch: 'universe' }, { ch: 'forum' }
      ] },
      { grp: 'Projet', items: [
        { ch: 'presentation' },
        { grp: 'Ecriture', items: [
          { ch: 'synopsis' }, { ch: 'board' }, { ch: 'titlepage' },
          { ch: 'script' }, { ch: 'moodboard' }, { ch: 'storyboard' }
        ] },
        { grp: 'Casting / Decors', items: [
          { ch: 'chars' }, { ch: 'actors' }, { ch: 'locs' },
          { ch: 'resources' }, { ch: 'crew' }, { ch: 'orgs' }
        ] },
        { grp: 'Production', items: [
          { ch: 'breakdown' }, { ch: 'planning' },
          { ch: 'scriptreport' }, { ch: 'stats' }
        ] },
        { grp: 'Admin', items: [
          { ch: 'expenses' }, { ch: 'contracts' }
        ] }
      ] }
    ],

    _menuHtml: function (items) {
      var self = this, html = '';
      items.forEach(function (it) {
        if (it.ch) {
          var ch = self.chapters[it.ch];
          if (!ch) return;
          html += '<div class="tour-ch">' +
            '<div class="tour-ch-txt"><strong>' + (ch.titre || it.ch) + '</strong><span>' + (ch.desc || '') + '</span></div>' +
            '<button class="tour-ch-go" data-ch="' + it.ch + '">Demarrer</button>' +
          '</div>';
        } else if (it.grp) {
          if (!it.items || !it.items.length) {
            html += '<div class="tour-grp-soon"><strong>' + it.grp + '</strong><span class="tour-soon">En cours de route</span></div>';
          } else {
            html += '<div class="tour-grp">' +
              '<button class="tour-grp-head"><span class="tour-chev">&#9656;</span><span>' + it.grp + '</span></button>' +
              '<div class="tour-grp-body">' + self._menuHtml(it.items) + '</div>' +
            '</div>';
          }
        }
      });
      return html;
    },

    openPanel: function () {
      this._ensureStyle();
      this._closePanel();
      var self = this;
      var ov = document.createElement('div');
      ov.className = 'tour-panel-ov';
      ov.id = 'tour-panel-ov';
      ov.innerHTML =
        '<div class="tour-panel" role="dialog">' +
          '<div class="tour-panel-head"><h3>Visites guidees</h3>' +
          '<button class="tour-panel-x" aria-label="Fermer">&times;</button></div>' +
          '<div class="tour-panel-body">' +
            '<button class="tour-here" id="tour-here-btn">Visite de l\'onglet en cours</button>' +
            this._menuHtml(this.menu) +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        if (e.target === ov || (e.target.classList && e.target.classList.contains('tour-panel-x'))) { self._closePanel(); return; }
        var here = e.target.closest ? e.target.closest('.tour-here') : null;
        if (here) { self.startCurrentTab(); return; }
        var head = e.target.closest ? e.target.closest('.tour-grp-head') : null;
        if (head) { var g = head.parentNode; if (g) g.classList.toggle('open'); return; }
        var btn = e.target.closest ? e.target.closest('.tour-ch-go') : null;
        if (btn) { var cid = btn.getAttribute('data-ch'); self._closePanel(); self.start(cid); }
      });
      this._panelKey = function (e) { if (e.key === 'Escape') self._closePanel(); };
      document.addEventListener('keydown', this._panelKey, true);
    },
    _closePanel: function () {
      var ov = document.getElementById('tour-panel-ov');
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      if (this._panelKey) { document.removeEventListener('keydown', this._panelKey, true); this._panelKey = null; }
    },

    start: function (chapterId) {
      if (this._active) this.stop();
      var ch = this.chapters[chapterId];
      if (!ch || !ch.steps || !ch.steps.length) return;
      if (typeof ch.available === 'function' && !ch.available()) {
        if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(ch.unavailable || 'Visite indisponible dans ce contexte.', 'info');
        return;
      }
      this._ensureStyle();
      this._steps = ch.steps;
      this._idx = 0;
      this._active = true;
      this._build();
      this._render();
      var self = this;
      this._onReflow = function () { self._position(); };
      window.addEventListener('resize', this._onReflow, true);
      window.addEventListener('scroll', this._onReflow, true);
      this._onKey = function (e) {
        if (e.key === 'Escape') { self.stop(); }
        else if (e.key === 'ArrowRight') { self.next(); }
        else if (e.key === 'ArrowLeft') { self.prev(); }
      };
      document.addEventListener('keydown', this._onKey, true);
    },

    _build: function () {
      var ov = document.createElement('div');
      ov.className = 'tour-overlay';
      var hole = document.createElement('div');
      hole.className = 'tour-hole';
      var tip = document.createElement('div');
      tip.className = 'tour-tooltip';
      ov.appendChild(hole);
      ov.appendChild(tip);
      document.body.appendChild(ov);
      this._els = { overlay: ov, hole: hole, tip: tip };
    },

    _render: function () {
      var step = this._steps[this._idx];
      this._closeMenu();
      var last = this._idx === this._steps.length - 1;
      var first = this._idx === 0;
      var t = this._els.tip;
      t.innerHTML =
        '<h4></h4><p></p>' +
        '<div class="tour-foot">' +
          '<span class="tour-count"></span>' +
          '<div class="tour-btns">' +
            '<button class="tour-skip" onclick="app.Tour.stop()">Quitter</button>' +
            '<button class="tour-prev" onclick="app.Tour.prev()"' + (first ? ' disabled' : '') + '>Precedent</button>' +
            '<button class="tour-next" onclick="app.Tour.next()">' + (last ? 'Terminer' : 'Suivant') + '</button>' +
          '</div>' +
        '</div>';
      t.querySelector('h4').textContent = step ? (step.title || '') : '';
      t.querySelector('p').textContent = step ? (step.body || '') : '';
      t.querySelector('.tour-count').textContent = (this._idx + 1) + ' / ' + this._steps.length;

      // POURQUOI CE DIFFERE (bug du rectangle rouge trop grand) :
      // on arrive ici DEPUIS le clic sur « Suivant ». Si on ouvre le menu et
      // qu'on mesure tout de suite, le clic finit ensuite sa remontee jusqu'au
      // document, ou un ecouteur global referme tous les menus deroulants.
      // Resultat : le trou etait dessine a la taille du menu OUVERT, mais le
      // menu se refermait juste apres — d'ou un grand rectangle rouge autour
      // d'un bouton seul. On laisse donc le clic finir sa course avant d'ouvrir
      // et de mesurer.
      var self = this;
      setTimeout(function () {
        if (!self._active || self._steps[self._idx] !== step) return;
        if (step && typeof step.onEnter === 'function') { try { step.onEnter(self); } catch (e) {} }
        var _ce = self._targets(step)[0];
        if (_ce && typeof _ce.scrollIntoView === 'function') {
          var _r = _ce.getBoundingClientRect();
          if (_r.top < 8 || _r.bottom > window.innerHeight - 8) {
            try { _ce.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
          }
        }
        self._position();
        // Seconde mesure une frame plus tard : un menu qui vient de s'ouvrir
        // ou un defilement en cours n'ont pas encore leur taille definitive.
        if (window.requestAnimationFrame) window.requestAnimationFrame(function () { if (self._active) self._position(); });
      }, 0);
    },

    // Un element masque (display:none, visibility:hidden, opacite nulle) ne doit
    // JAMAIS entrer dans le rectangle rouge : il donnerait un trou entourant du
    // vide, ou pire, la taille qu'il aurait s'il etait ouvert.
    _visible: function (el) {
      if (!el || !el.getBoundingClientRect) return false;
      if (el.offsetParent === null && el.tagName !== 'BODY') {
        var pos = '';
        try { pos = window.getComputedStyle(el).position; } catch (e) {}
        if (pos !== 'fixed') return false;
      }
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      try {
        var cs = window.getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
      } catch (e) {}
      return true;
    },

    _targets: function (step) {
      var els = [];
      if (!step) return els;
      if (typeof step.target === 'function') { var r = step.target(); if (r) els = els.concat(r); }
      else if (step.target) { var e = document.querySelector(step.target); if (e) els.push(e); }
      var self = this;
      return els.filter(function (x) { return self._visible(x); });
    },

    _position: function () {
      if (!this._active) return;
      var step = this._steps[this._idx];
      var hole = this._els.hole, tip = this._els.tip;
      var vw = window.innerWidth, vh = window.innerHeight;
      var els = this._targets(step);
      var pad = 6, margin = 14;
      var tr = tip.getBoundingClientRect();

      if (!els.length) {
        hole.style.width = '0px'; hole.style.height = '0px';
        hole.style.left = (vw / 2) + 'px'; hole.style.top = (vh / 2) + 'px';
        tip.style.left = Math.round((vw - tr.width) / 2) + 'px';
        tip.style.top = Math.round((vh - tr.height) / 2) + 'px';
        return;
      }

      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
        x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
      });
      if (x1 === Infinity) { x1 = vw / 2; y1 = vh / 2; x2 = x1; y2 = y1; }

      hole.style.left = Math.round(x1 - pad) + 'px';
      hole.style.top = Math.round(y1 - pad) + 'px';
      hole.style.width = Math.round((x2 - x1) + pad * 2) + 'px';
      hole.style.height = Math.round((y2 - y1) + pad * 2) + 'px';

      var top = y2 + pad + margin;
      if (top + tr.height > vh - 8) top = Math.max(8, y1 - pad - margin - tr.height);
      if (top < 8) top = 8;
      if (top + tr.height > vh - 8) top = Math.max(8, vh - 8 - tr.height);
      var left = x1;
      if (left + tr.width > vw - 8) left = vw - 8 - tr.width;
      if (left < 8) left = 8;
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
    },

    next: function () {
      if (!this._active) return;
      if (this._idx < this._steps.length - 1) { this._idx++; this._render(); }
      else { this.stop(); }
    },
    prev: function () {
      if (!this._active) return;
      if (this._idx > 0) { this._idx--; this._render(); }
    },
    // Tour.goTo retirée v569, jamais appelée.

    stop: function () {
      if (!this._active) return;
      this._active = false;
      this._closeMenu();
      if (this._onReflow) {
        window.removeEventListener('resize', this._onReflow, true);
        window.removeEventListener('scroll', this._onReflow, true);
        this._onReflow = null;
      }
      if (this._onKey) { document.removeEventListener('keydown', this._onKey, true); this._onKey = null; }
      if (this._els.overlay && this._els.overlay.parentNode) {
        this._els.overlay.parentNode.removeChild(this._els.overlay);
      }
      this._els = {};
    }
  };
