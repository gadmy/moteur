
  const Tutorial = {
    // ===================== DONNÉES (sections & aides) =====================
    sections: [
      {
        id: 'intro',
        title: '🎬 Introduction',
        content: `
          <h3>Bienvenue dans Moteur !</h3>
          <p>Moteur est l'application tout-en-un pour gérer ton projet de film. Que tu sois <strong>réalisateur·ice, producteur·ice, comédien·ne, technicien·ne</strong> ou passionné·e de cinéma, Moteur centralise tout : écriture du scénario, casting, planning, budget, storyboard, dépouillement, rapport de production...</p>
          <p>Plus besoin de jongler entre dix logiciels différents. Moteur gère tout, du premier mot à la dernière prise.</p>
          
          <h3>Les 3 espaces principaux</h3>
          <p><strong>🏠 Accueil :</strong> Dès la connexion, tu arrives sur la grille de tes projets. Les menus du haut donnent accès au reste : Mon Espace (Profil, Contacts), Communauté (Univers, Forum), Aide (Cours, Guide, Visites guidées, Conditions &amp; mentions légales).</p>
          <div class="tuto-tip"><strong>🗑 Corbeille :</strong> Supprimer un projet ne l'efface pas tout de suite : il part à la <strong>Corbeille</strong> (bouton dans la barre des dossiers), récupérable <strong>30 jours</strong> via « Restaurer », puis effacé définitivement (données et fichiers).</div>
          <p><strong>📁 L'espace projet :</strong> L'espace de travail sur un film. Onglets à gauche (scénario, séquencier, dépouillement...), menus en haut, équipe connectée en temps réel.</p>
          <p><strong>🌍 Univers :</strong> L'annuaire communautaire. Tous les profils et projets publics géolocalisés sur une carte.</p>
          
          <h3>Collaboration dans l'ADN</h3>
          <p>Tu peux collaborer en temps réel avec toute ton équipe. Synchronisation instantanée, mini-tchat de projet, commentaires, permissions fines. Et grâce aux <strong>casquettes</strong>, ton profil unique peut cumuler plusieurs rôles (ex : réalisateur·ice + comédien·ne).</p>
          
          <div class="tuto-tip"><strong>🚧 Pré-alpha ouverte :</strong> Moteur est en développement actif. Des bugs peuvent survenir, des fonctionnalités sont incomplètes. Tes données peuvent évoluer. Utilise à des fins de test et d'exploration !</div>
          <div class="tuto-tip"><strong>💡 Vos remarques :</strong> Trouvé un bug ? Une idée ? L'ampoule 💡 en bas à gauche ouvre « Vos remarques » : tu écris, tu peux te relire et corriger jusqu'à la nuit suivante, puis c'est transmis. Le Forum reste là pour les échanges entre membres. L'app grandit avec vous !</div>
          
          <p><strong>Commence par :</strong> compléter ton profil public (pour apparaître dans l'Univers), puis crée ton premier projet via le bouton "Nouveau projet" sur l'accueil.</p>
        `
      },
      {
        id: 'series',
        title: '📺 Film ou Série',
        content: `
          <h3>Un choix fait à la création</h3>
          <p>Quand tu crées un projet, une première fenêtre te demande s'il s'agit d'un <strong>Film</strong> ou d'une <strong>Série</strong>. En série, tu annonces tout de suite le nombre de <strong>saisons</strong> (jusqu'à 20) et d'<strong>épisodes par saison</strong> (jusqu'à 50) ; tu pourras en ajouter ou en retirer ensuite.</p>
          <div class="tuto-tip"><strong>⚠️ Le type ne se change pas après coup :</strong> un projet créé en Film reste un film. Si tu hésites, pars sur une série d'un seul épisode plutôt que l'inverse.</div>

          <h3>Deux onglets en plus</h3>
          <p>Une série fait apparaître deux onglets d'écriture réservés : <strong>📺 Saisons</strong> et <strong>🎬 Épisodes</strong>. Ils n'existent pas sur un film.</p>
          <p><strong>Saisons :</strong> une carte par saison, avec son numéro, un titre facultatif et le nombre d'épisodes qu'elle contient. Réordonne par glisser-déposer ; « 📂 Voir épisodes » bascule sur les épisodes de cette saison.</p>
          <p><strong>Épisodes :</strong> une carte par épisode de la saison affichée, avec une vignette que tu peux remplacer par ton image.</p>

          <h3>Le sélecteur du bandeau</h3>
          <p>C'est la pièce maîtresse. En haut de l'espace projet, deux menus <strong>S..</strong> et <strong>E..</strong> choisissent la saison et l'épisode <strong>courants</strong>. Scénario, séquencier, beat board et dépouillement ne montrent alors que les scènes de cet épisode.</p>
          <div class="tuto-tip"><strong>💡 Une scène appartient à un épisode :</strong> elle est rattachée à l'épisode actif <strong>au moment où tu la crées</strong>. Vérifie le sélecteur avant d'écrire, sinon tu écriras dans le mauvais épisode.</div>

          <h3>Ce qui reste commun</h3>
          <p>Tout le reste appartient à la série entière, pas à un épisode : <strong>casting, équipe technique, décors, ressources, structures, budget, contrats et planning</strong>. C'est voulu — on ne recrute pas une nouvelle équipe à chaque épisode.</p>
          <p><strong>Exports :</strong> quand un document peut être découpé par épisode (séquencier, personnages, storyboard...), l'export te demande d'abord quels épisodes inclure.</p>
        `
      },
      {
        id: 'univers',
        title: '🌍 L\'Univers',
        content: `
          <h3>L'annuaire de la communauté</h3>
          <p>L'Univers, c'est l'annuaire de la communauté Moteur ! Tu y trouves des profils et projets sur une carte interactive centrée sur la France et ouverte sur le monde.</p>
          <p>Tu vois les professionnels du cinéma géolocalisés : <strong>comédien·ne·s, technicien·ne·s, associations, boîtes de prod</strong>... Survole un marqueur pour voir un aperçu rapide, clique pour ouvrir la fiche complète.</p>
          
          <h3>Recherche & filtres</h3>
          <div class="tuto-tip"><strong>💡 Filtres puissants :</strong> Métier, compétences, langues, niveau sportif, zone géographique, avec ou sans véhicule, distance depuis ta ville... Trouve le perchman ou la chef op de tes rêves !</div>
          <p><strong>🎯 Projets pour moi :</strong> En haut à gauche, choisis ton profil puis clique <em>Matcher</em>. L'Univers ne te montre plus que les projets qui cherchent un talent comme le tien (métier, compétences, zone...).</p>
          <p><strong>📋 Vue Carte / Liste :</strong> Bascule entre la carte et une liste triable (nom, ville, distance). Pratique quand tu veux scroller les profils sans zoomer.</p>
          
          <h3>Plusieurs casquettes d'une même personne</h3>
          <p>Une personne porte parfois plusieurs casquettes (ex : Réalisatrice + Comédienne).</p>
          <p><strong>‹ Pager › :</strong> Dans sa fiche, des flèches ‹ › apparaissent si elle a plusieurs casquettes. Navigue de l'une à l'autre sans fermer la fiche. Des badges sur son marqueur indiquent aussi ses casquettes d'un coup d'œil.</p>
          
          <h3>Interactions sur une fiche</h3>
          <p><strong>☆ Favori :</strong> Ajoute la personne ou le projet à tes favoris. Retrouve-les dans <em>Contacts</em>.</p>
          <p><strong>📧 Contacter :</strong> La fiche affiche le contact public (email, téléphone) que la personne a choisi d'exposer, sous forme de liens mailto: / tel:. Tu la joins par ton propre outil (mail, SMS) : il n'y a pas de messagerie interne, et l'adresse de ton compte n'est jamais dévoilée.</p>
          <p><strong>🚩 Signaler :</strong> Si un contenu est inapproprié, signale le profil. L'équipe de modération est alertée.</p>
          
          <h3>Projets dans l'Univers</h3>
          <p>Les projets publics apparaissent aussi sur la carte avec leurs besoins en casting et équipe. Tu vois qui tourne quoi, et où. Clique sur un projet pour voir le détail et te proposer.</p>
        `
      },
      {
        id: 'scenario',
        title: '📝 Scénario',
        content: `
          <h3>Le cœur du projet</h3>
          <p>C'est ici que tout commence ! Tu as trois options : écrire depuis zéro, importer un PDF, ou importer un fichier Final Draft.</p>
          <p>L'éditeur propose tous les types de paragraphes : action, personnage, dialogue, transition...</p>
          <div class="tuto-tip"><strong>💡 Raccourcis :</strong> Tab pour basculer entre les types. Ctrl+1 pour Action, Ctrl+2 pour Personnage, Ctrl+3 pour Dialogue...</div>
          <p><strong>Import PDF :</strong> Tu uploades ton scénario, et un assistant t'aide à identifier chaque élément. Clique sur une ligne, dis "ça c'est un personnage", et toutes les lignes similaires sont détectées !</p>
          <p><strong>Modes de vue :</strong> Vue Scènes pour travailler scène par scène, ou Vue Script pour tout voir d'un coup.</p>
          <p><strong>Mode Focus (F11) :</strong> L'interface disparaît pour te concentrer sur le texte. Échap pour quitter.</p>
          <p><strong>Export :</strong> PDF formaté pro, Fountain universel, ou Final Draft FDX.</p>
        `
      },
      {
        id: 'synopsis',
        title: '📄 Synopsis & Titre',
        content: `
          <h3>Les bases de ton projet</h3>
          <p>Cet onglet regroupe <strong>trois versions de ton pitch</strong>, adaptées à chaque usage. Une sidebar à gauche te permet de basculer entre les trois en un clic — tu ne vois qu'un seul texte à la fois pour rester concentré·e.</p>
          
          <h3>📖 Synopsis</h3>
          <p>Le résumé "moyen" de ton film, 1 à 2 pages en général. Il décrit l'intrigue, les enjeux, les personnages principaux et l'arc narratif. C'est le document envoyé aux producteurs, aux commissions, aux partenaires financiers.</p>
          
          <h3>⚡ Résumé court</h3>
          <p>Le pitch express, 3-5 lignes maximum. Ce que tu racontes à quelqu'un qui te demande "ça parle de quoi ?" en soirée. Sert pour les flyers, les affiches, les posts réseaux sociaux.</p>
          
          <h3>📚 Résumé long</h3>
          <p>Le traitement détaillé, 5 à 20 pages. Scène par scène, avec plus de détails sur les lieux, les ambiances, les dialogues clés. C'est le document pour les lectures approfondies et les analyses dramaturgiques.</p>
          
          <h3>Éditeur pro</h3>
          <p>Chaque section a son <strong>éditeur de texte complet</strong> : styles (titre 1/2/3, citation), gras/italique/souligné, listes à puces ou numérotées, alignement, insertion d'images, tableaux, ligne horizontale.</p>
          <p><strong>Format A4 :</strong> L'édition se fait au format page (210mm), comme dans un traitement de texte. Tu vois directement à quoi ressemble le rendu final.</p>
          
          <div class="tuto-tip"><strong>💡 Compteur de caractères :</strong> Sous chaque bouton de la sidebar, tu vois en temps réel combien de caractères contient ta section. Pratique pour calibrer un résumé aux bonnes dimensions.</div>
          
          <h3>📜 Page de Titre</h3>
          <p>Ta couverture pro avec titre, auteur, contact, version, date, source... Ces infos apparaissent automatiquement sur tous tes exports PDF (scénario, documents de prod). Ajoute un copyright et des notes de production pour boucler la présentation.</p>
          
          <div class="tuto-tip"><strong>💡 Pro tip :</strong> Tes trois résumés sont sauvegardés en permanence, tu peux basculer entre eux sans jamais perdre de texte. Le style et les images sont préservés.</div>
        `
      },
      {
        id: 'sequencier',
        title: '📋 Séquencier & Beat Board',
        content: `
          <h3>La vue d'ensemble de ton film</h3>
          <p><strong>Séquencier :</strong> Toutes tes scènes organisées visuellement. Chaque scène est une fiche avec numéro, décor, résumé, effet jour/nuit. Réorganise par glisser-déposer.</p>
          <div class="tuto-tip"><strong>💡 Couleurs :</strong> Regroupe tes scènes par acte, lieu, ambiance... à toi de voir !</div>
          <p><strong>Beat Board :</strong> Mode visuel où tes scènes deviennent des fiches sur un grand canvas. Déplace-les librement, zoome, dézoome.</p>
          <p>Le fil rouge relie tes scènes dans l'ordre - c'est la timeline visuelle ! Maintiens Shift et glisse pour déplacer une scène dans le fil.</p>
          <p>Ctrl+clic pour sélectionner plusieurs scènes et les déplacer ensemble.</p>
        `
      },
      {
        id: 'depouillement',
        title: '🔍 Dépouillement',
        content: `
          <h3>L'étape clé entre écriture et production</h3>
          <p>Le dépouillement, c'est analyser chaque scène pour identifier <strong>tout ce qu'il faut préparer pour tourner</strong> : personnages, accessoires, costumes, décors, véhicules, figurants, effets spéciaux...</p>
          <div class="tuto-tip"><strong>⚠️ Finaliser d'abord :</strong> Une scène doit être finalisée pour être dépouillée. Tant qu'une scène est en brouillon, le texte peut encore changer — inutile de dépouiller dans le vide.</div>
          
          <h3>Comment dépouiller</h3>
          <p><strong>Surligne</strong> un mot ou une portion de texte dans le scénario, <strong>clic droit</strong>, choisis la catégorie (accessoire, costume, véhicule, FX, figurant...). L'élément est ajouté à la fiche de la scène sur la droite.</p>
          <p><strong>🧠 Détection intelligente :</strong> Si "épée" apparaît dans d'autres scènes, le système te propose de les lier automatiquement. Tu gagnes un temps fou.</p>
          
          <h3>Auto-remplissage</h3>
          <p><strong>🎭 Personnages :</strong> Détectés automatiquement depuis les dialogues. Pas besoin de les ajouter à la main.</p>
          <p><strong>👥 Comédiens :</strong> Si tu as lié un personnage à un comédien (dans l'onglet Personnages), celui-ci apparaît automatiquement dans la catégorie COMEDIENS de chaque scène où son personnage joue.</p>
          
          <h3>Ligne jaune au survol</h3>
          <p>Dans le panneau de droite, <strong>passe la souris sur n'importe quel tag</strong> : une ligne jaune relie le tag à l'endroit où il est marqué dans le script à gauche. Pratique pour retrouver instantanément le contexte.</p>
          <div class="tuto-tip"><strong>💡 Pour les comédiens :</strong> Même si le nom du comédien (ex : "Laure Perrin") n'apparaît pas dans le script, la ligne pointe vers le personnage qu'il·elle joue (ex : "NORA"). Le système fait le lien automatiquement.</div>
          
          <h3>Tout remonte automatiquement</h3>
          <p>Chaque élément dépouillé s'ajoute aux autres onglets de l'app :</p>
          <p><strong>📦 Ressources :</strong> Accessoires, costumes, véhicules agrégés pour gérer la liste à préparer.</p>
          <p><strong>🎬 Casting :</strong> Comédiens et figurants classés par scène.</p>
          <p><strong>📅 Planning :</strong> Tu sais quel comédien est nécessaire quel jour, pour calculer les jours de tournage.</p>
          <p><strong>💰 Budget :</strong> Les éléments dépouillés nourrissent les devis.</p>
          <div class="tuto-tip"><strong>⚡ Gain de temps énorme :</strong> En dépouillant bien ton scénario, tu prépares déjà 60% du travail de production. Les feuilles de service, les listes d'accessoires, le planning... tout se déduit du dépouillement.</div>
        `
      },
      {
        id: 'ressources',
        title: '📦 Ressources',
        content: `
          <h3>Tout ce qu'il faut réunir</h3>
          <p>L'onglet <strong>Ressources</strong> agrège ce que ton dépouillement a identifié : accessoires, costumes, véhicules, matériel... Chaque élément devient une ligne à préparer et à suivre.</p>
          <p>Tu vois dans quelles scènes chaque ressource est utilisée, et tu peux noter qui l'apporte, son coût ou son statut (à trouver / réservé / obtenu).</p>
          <div class="tuto-tip"><strong>🔄 Alimenté par le dépouillement :</strong> chaque tag posé dans le Dépouillement (accessoire, costume, véhicule, FX...) remonte ici automatiquement. Plus tu dépouilles, plus ta liste de préparation se construit toute seule.</div>
          <p>Export PDF : la liste complète des ressources, idéale pour la régie et la préparation.</p>
        `
      },
      {
        id: 'storyboard',
        title: '🎨 Storyboard',
        content: `
          <h3>Ton film en images</h3>
          <p>Chaque plan dessiné pour visualiser tes intentions. À gauche, la liste des scènes. Clique pour voir et créer les plans.</p>
          <p>Pour chaque plan : type (gros plan, plan large...), mouvement caméra (travelling, panoramique...), angle, durée estimée.</p>
          <p><strong>Éditeur de dessin intégré :</strong> Clique sur la vignette pour dessiner. Crayon, formes, texte, couleurs, import d'images de référence.</p>
          <div class="tuto-tip"><strong>💡 Pas besoin d'être artiste :</strong> Des bonhommes bâtons suffisent pour communiquer ta vision !</div>
          <p><strong>Export PDF :</strong> Grille 2x2, format paysage, prêt à distribuer à l'équipe.</p>
        `
      },
      {
        id: 'moodboard',
        title: '🖼️ MoodBoard',
        content: `
          <h3>Ton tableau d'inspiration</h3>
          <p>Ambiances, couleurs, références visuelles... Crée plusieurs planches : décors, costumes, éclairage...</p>
          <p>Glisse-dépose des images, redimensionne, tourne, superpose. 34 formes géométriques disponibles (rectangles, cercles, flèches, bulles, cadres...).</p>
          <p><strong>Générateur de palettes :</strong> Roue chromatique style Adobe Color. Choisis une harmonie (complémentaire, triade, analogue) et hop, 5 couleurs assorties !</p>
          <div class="tuto-tip"><strong>💡 Astuce :</strong> Clique sur une couleur de palette pour copier son code hex.</div>
          <p>Export en PNG ou PDF haute qualité.</p>
        `
      },
      {
        id: 'casting',
        title: '🎭 Comédiens & Casting',
        content: `
          <h3>Gère tous tes comédiens</h3>
          <p>Deux vues : par Personnages du scénario, ou par Comédiens avec fiches complètes.</p>
          <p>Chaque personnage peut être lié à un comédien. Tu vois qui joue qui en un coup d'œil.</p>
          <p><strong>Fiche comédien :</strong> Photo, contact, mensurations, compétences, disponibilités. Jusqu'à 3 photos pour la galerie (essais costumes !).</p>
          <div class="tuto-tip"><strong>💡 Contrats :</strong> Le bouton Contrat sur chaque fiche génère directement le document. Les jours de tournage sont calculés depuis le planning.</div>
        `
      },
      {
        id: 'figuration',
        title: '🎟️ Figuration',
        content: `
          <h3>Tes figurant·es, à part du casting</h3>
          <p>L'onglet <strong>Casting &gt; Figuration</strong> gère les figurant·es <strong>séparément</strong> des comédien·nes : un répertoire dédié, avec son propre suivi, pour ne pas mélanger figuration et casting principal.</p>
          <p>Chaque figurant·e a une fiche (nom, photo) sur le même modèle que les fiches comédiens. Ajoute-les un·e par un·e via <strong>« ➕ Nouveau figurant »</strong>.</p>

          <h3>Groupes de convocation</h3>
          <p>Regroupe tes figurant·es en <strong>groupes nommés</strong> (« Passants gare », « Invités mariage »...) via <strong>« 👥 Nouveau groupe »</strong>, puis coche les membres. Un·e figurant·e peut appartenir à plusieurs groupes. À la convocation, choisir un groupe ajoute d'un coup tous ses membres.</p>

          <h3>Convocation par jour</h3>
          <p>Dans l'éditeur d'un jour de tournage, à côté de la feuille de service, l'onglet <strong>« FDS figu »</strong> reprend en lecture seule les infos du jour (scènes, lieu, horaires, météo, notes générales) — toute modification se fait côté feuille de service normale, rien n'est dupliqué.</p>
          <p>Tu y montes la liste des figurant·es convoqué·es : pour chacun·e une <strong>heure</strong> (vide = convocation équipe du jour), un <strong>transport</strong> (Perso défrayé / payé / bénévole, Régie ou Autre) et une note.</p>

          <div class="tuto-tip"><strong>💡 Feuille figuration automatique :</strong> dès qu'un jour compte au moins un·e figurant·e convoqué·e, sa feuille figuration sort automatiquement à la suite de la feuille de service, dans le même PDF — que tu exportes le jour, l'envoies par mail ou génères le Dossier de Production.</div>
        `
      },
      {
        id: 'lieux',
        title: '📍 Lieux & Décors',
        content: `
          <h3>Tous les décors de ton film</h3>
          <p>L'onglet <strong>Décors</strong> recense les décors de ton tournage : intérieurs, extérieurs, studios... Chaque lieu a sa fiche avec adresse, contact du propriétaire, autorisations, photos de repérage et notes d'accès.</p>
          <p>Les décors mentionnés dans tes scènes (le « INT. / EXT. » du scénario) peuvent être rattachés à un lieu réel : tu sais ainsi où se tourne chaque scène.</p>
          <div class="tuto-tip"><strong>📍 Carte :</strong> Ajoute les coordonnées d'un lieu pour l'afficher sur une mini-carte avec lien Google Maps — pratique pour le repérage et la feuille de service.</div>
          <p><strong>Vers la feuille de service :</strong> le lieu d'un jour de tournage reprend automatiquement l'adresse, la carte et le contact saisis ici.</p>
          <p>Export PDF : la liste des décors avec photos et coordonnées, ou une fiche détaillée par lieu.</p>
        `
      },
      {
        id: 'equipe',
        title: '🎥 Équipe Technique',
        content: `
          <h3>Ton organigramme technique</h3>
          <p>Tous les postes, tous les départements : réalisateur, chef op, ingé son, scripte, machino...</p>
          <p>Chaque fiche technicien·ne est une fiche à onglets : <em>Dans le projet</em> (département, poste, notes), <em>Photos &amp; démo</em>, <em>Profil</em> (identité, contact), <em>Parcours</em> (bio, expérience, notes) et <em>Planning &amp; logistique</em> (disponibilités, véhicule, cachet et statut).</p>
          <p><strong>Contrats :</strong> Génère un CDDU ou contrat de prestation selon le statut.</p>
          <p>L'export PDF liste tout le monde par département avec coordonnées. Parfait pour le premier jour !</p>
          <p><strong>🚐 Véhicules de production :</strong> le bouton « Ajouter Véhicule » crée un véhicule de régie (places conducteur inclus, permis requis) pour le transport de l'équipe, listé sous les techniciens.</p>
        `
      },
      {
        id: 'orgs',
        title: '🏛️ Asso / Entreprises',
        content: `
          <h3>Le pôle des structures</h3>
          <p>L'onglet <strong>Production &gt; Asso / Entreprises</strong> gère les associations, sociétés de production, partenaires et financeurs, à parité avec les onglets Comédien·nes et Équipe technique.</p>

          <h3>Une vraie fiche structure</h3>
          <p>Quand tu ajoutes une structure depuis l'Univers, un instantané complet de sa fiche est copié dans ton projet : logo, type, SIRET / RNA, forme juridique, année, effectif ou nombre de membres, dirigeant·e ou président·e, mission, services, email, téléphone, siège, site et réseaux sociaux. C'est aussi la base qui alimentera l'autocomplétion des contrats.</p>
          <p><strong>🔒 Liée à l'Univers :</strong> une fiche rattachée à un profil de l'Univers est en lecture seule — seul le propriétaire de la structure en modifie le contenu. Une fiche créée à la main ou importée d'un contact non lié reste entièrement éditable.</p>

          <h3>Sur ce projet</h3>
          <p>Cette section est <strong>toujours éditable</strong>, même sur une fiche verrouillée. Le <strong>département</strong> est un menu déroulant (les groupes techniques de ton projet + Financeurs) qui pilote la liste des fonctions disponibles ; « Autre » ouvre un champ libre. Tu peux aussi y laisser des notes.</p>

          <div class="tuto-tip"><strong>💡 Toujours à jour :</strong> à chaque ouverture de l'onglet, les fiches liées sont resynchronisées depuis l'Univers en une seule requête. Fini les copies figées : si la structure modifie sa fiche, tu vois le changement au retour.</div>
        `
      },
      {
        id: 'planning',
        title: '📅 Planning & Feuilles de Service',
        content: `
          <h3>Le calendrier de ton tournage</h3>
          <p>Chaque jour, chaque scène, organisés visuellement. Clique sur une date pour voir/créer le détail.</p>
          <p><strong>Feuille de Service :</strong> LE document que tout le monde attend ! Lieu, horaires, météo, programme, équipe convoquée...</p>
          <div class="tuto-tip"><strong>💡 Météo auto :</strong> Récupérée automatiquement via API. Température, pluie, vent, lever du soleil !</div>
          <p>Le lieu affiche une carte interactive avec lien Google Maps.</p>

          <h3>Dépouillement du jour, par catégorie</h3>
          <p>La section « Besoins » du jour reprend le <strong>dépouillement automatique</strong> tiré du scénario, classé par les 16 catégories (décors, costumes, accessoires, véhicules...). Pour chaque catégorie tu peux, <strong>localement à ce jour</strong> : ajouter des <strong>oublis / imprévus</strong> à la main, écrire des <strong>notes / consignes</strong> libres, ou <strong>« ✕ retirer de la FDS »</strong> une catégorie (réversible via le bandeau « catégories retirées » en bas).</p>
          <div class="tuto-tip"><strong>💡 Local au jour :</strong> ces ajouts, notes et retraits ne touchent <strong>jamais</strong> le dépouillement du scénario — ils ne valent que pour la feuille de service de ce jour-là.</div>

          <h3>Repas</h3>
          <p>Un encart <strong>« Repas »</strong> (texte libre) rappelle le·la <strong>régisseur·euse général·e</strong> assigné·e à l'équipe. Éditable par le propriétaire, les rôles ayant le droit planning, ou le·la RG en personne. Il ressort sur la feuille de service PDF sous « Repas à prévoir ».</p>

          <h3>Transport</h3>
          <p>Le transport distingue <strong>« Amène (V. perso) »</strong> et <strong>« Amène (V. régie) »</strong>. Le véhicule perso n'apparaît que si la personne a un véhicule exploitable et au moins un permis ; la régie, que si le parc véhicules n'est pas vide. En « V. régie », un sélecteur ne propose que les véhicules que la personne peut conduire (permis détenu), et le covoiturage est plafonné au nombre de places (conducteur inclus).</p>
          <p><strong>Covoiturage intelligent :</strong> si Lila amène Sarah, Sarah est automatiquement marquée « part avec Lila ».</p>

          <h3>Export</h3>
          <p>Export PDF nommé <em>Projet_FDS_Lieu_Date</em>, prêt à envoyer. Si des figurant·es sont convoqué·es ce jour-là, leur <strong>feuille figuration</strong> est jointe à la suite (voir la section Figuration).</p>
        `
      },
      {
        id: 'budget',
        title: '💰 Budget & Dépenses',
        content: `
          <h3>Le nerf de la guerre</h3>
          <p><strong>Mode Simple :</strong> Budget global + liste de dépenses (à payer / payé).</p>
          <p><strong>Mode Avancé :</strong> Catégories, enveloppes, responsables par poste, workflow de validation.</p>
          <p>Les salaires peuvent être calculés automatiquement depuis les fiches comédiens/techniciens.</p>
          <div class="tuto-tip"><strong>💡 Graphiques :</strong> Visualise la répartition par catégorie. Tu vois où part ton budget.</div>
          <p>Export Excel détaillé pour ton comptable, ou rapport PDF de synthèse.</p>
        `
      },
      {
        id: 'contrats',
        title: '📋 Contrats',
        content: `
          <h3>Documents conformes au droit français</h3>
          <p><strong>4 types :</strong> Droit à l'image (RGPD), CDDU (intermittents), Prestation, Accord bénévole. Le CDDU inclut toutes les mentions légales : motif de recours, DPAE, congés spectacles...</p>
          <h3>Un hub en 3 colonnes</h3>
          <p>À gauche, les fiches du projet (comédien·nes, technicien·nes, structures), triées A→Z ou par métier. Au centre, les contrats de la personne sélectionnée et le bouton « + Nouveau ». À droite, l'éditeur du contrat, directement dans la page.</p>
          <p><strong>Statuts :</strong> brouillon → à signer → signé → archivé. Chaque contrat est enregistré dans le projet et exportable en PDF.</p>
          <p><strong>Mes modèles :</strong> enregistre un arrangement comme modèle réutilisable (bouton « ⭐ Modèle » dans l'éditeur), pour ce projet seul ou pour tous tes projets. Les modèles apparaissent dans le picker « + Nouveau » et leurs champs se remplissent automatiquement pour la nouvelle personne.</p>
          <div class="tuto-tip"><strong>💡 Champs dynamiques :</strong> les jetons (nom, dates, montants...) se remplissent depuis les fiches. Les infos légales de ta production se règlent dans l'onglet Présentation (SIRET, licence...).</div>
        `
      },
      {
        id: 'profil',
        title: '👤 Mon Profil Public',
        content: `
          <h3>Ta carte de visite pro</h3>
          <p>Pour apparaître dans l'Univers, active au moins une casquette : <strong>Comédien·ne, Technicien·ne, Association ou Entreprise</strong>. Chaque casquette te rend visible auprès des autres membres de la communauté.</p>
          <div class="tuto-tip"><strong>💡 Quatre casquettes :</strong> Ton profil unique peut cumuler jusqu'à 4 casquettes (comédien·ne, technicien·ne, association, entreprise). Chaque casquette a ses propres champs et sa propre visibilité dans l'Univers.</div>
          <p><strong>Profil Comédien·ne :</strong> Nom de scène, mensurations, compétences, langues, sports (avec niveaux). Jusqu'à 3 photos (profil, plein-pied, portrait).</p>
          <p><strong>Profil Technicien·ne :</strong> Département et poste (perche, lumière, machino...), identité, contact, photos, bande démo, parcours, disponibilités, véhicule et tarif. Tu peux ouvrir <strong>plusieurs fiches technicien</strong> si tu tiens plusieurs spécialités : le bouton « + » sur la grille des casquettes en crée une nouvelle, qui reprend ton identité et ton véhicule.</p>
          <p><strong>Profil Association / Entreprise :</strong> Nom de structure, description, membres référents, zone d'action.</p>
          <div class="tuto-tip"><strong>🔒 Visibilité :</strong> elle se règle <strong>par casquette</strong>, avec la case « 👁 Univers » sur sa carte. Tu peux être cherchable comme technicien·ne sans l'être comme comédien·ne. Le bouton « 🧹 Effacer » vide une casquette sans toucher aux autres ni à ton compte.</div>
          <p><strong>📍 Géolocalisation :</strong> Ajoute ta ville et tu apparais pile au bon endroit sur la carte de l'Univers.</p>
          <p><strong>🚗 Permis & véhicule :</strong> indique tes permis (moto, VL, PL, SPL, TC) et, si tu as un véhicule, précise si tu le mets à dispo d'un tournage (gratuitement, contre dédommagement ou payé) — ou pas. Ces infos servent au transport de l'équipe.</p>
          <p>Tarif, zone de mobilité, coordonnées de contact... Tout pour faciliter les contacts !</p>
        `
      },
      {
        id: 'multi-profils',
        title: '🎭 Jongler entre tes casquettes',
        content: `
          <h3>Un compte, un profil, plusieurs casquettes</h3>
          <p>Sur Moteur, ton compte possède <strong>un seul profil public</strong>. Mais ce profil peut porter <strong>jusqu'à 4 casquettes</strong> : Comédien·ne, Technicien·ne, Association et Entreprise. Idéal si tu cumules les rôles (réalisateur·ice qui joue, technicien·ne qui gère sa boîte de prod...).</p>

          <h3>Activer une casquette</h3>
          <p>Va dans <em>Mon Profil</em> : les casquettes s'affichent en <strong>grille de cartes</strong>. Une carte grisée s'active d'un clic — et ouvre aussitôt sa fiche ; la croix la regrise. Chaque carte a sa case « 👁 Univers » et son bouton « 🧹 Effacer », indépendants des autres. La carte « + » du côté technicien ajoute une <strong>deuxième fiche technicien</strong> pour une autre spécialité, en reprenant ton identité et ton véhicule.</p>
          <div class="tuto-tip"><strong>💡 Chaque casquette est autonome :</strong> son identité, ses photos, son tarif, ses disponibilités, son contact public... Les fiches Comédien·ne et Technicien·ne ont chacune leurs champs, et au premier remplissage elles héritent en douceur de tes anciennes valeurs communes.</div>

          <h3>Dans l'Univers</h3>
          <p>Tu apparais avec <strong>un seul marqueur</strong> sur la carte, orné de badges montrant tes casquettes. En cliquant sur ta fiche, un <strong>pager ‹ ›</strong> permet de naviguer entre tes différentes casquettes. Les filtres de l'Univers permettent de chercher par casquette.</p>

          <h3>Sur un projet</h3>
          <p>Tu peux apparaître avec <strong>plusieurs étiquettes</strong> sur un même projet — propriétaire ET acteur·ice par exemple. Parfait pour l'auto-distribution et les micro-budgets.</p>

          <div class="tuto-tip"><strong>🧹 Effacer :</strong> le bouton « Effacer » sur une carte de casquette vide uniquement cette casquette, sans toucher aux autres ni à ton compte.</div>
        `
      },
      {
        id: 'collaboration',
        title: '👥 Collaboration',
        content: `
          <h3>Travaille en équipe</h3>
          <p>Moteur est pensé pour la collaboration. Invite des collaborateurs par email via le bouton <em>📤 Partager</em> de ton projet, choisis leur rôle, et ils reçoivent une invitation par email (plus une notification s'ils ont déjà un compte).</p>
          
          <h3>Les 3 rôles</h3>
          <p><strong>👑 Propriétaire (owner) :</strong> C'est toi, qui as créé le projet. Tu peux tout faire : inviter, modifier, supprimer, exporter. Un seul propriétaire par projet.</p>
          <p><strong>✏️ Éditeur :</strong> Peut modifier tous les contenus (scénario, séquencier, dépouillement, planning, budget...). Ne peut pas supprimer le projet ni changer les permissions des autres.</p>
          <p><strong>👁️ Lecteur :</strong> Lecture seule. Voit tout mais ne peut rien modifier. Idéal pour les producteurs ou partenaires que tu veux tenir informés.</p>
          
          <h3>Plusieurs casquettes sur un projet</h3>
          <p>Tu invites une personne par son email ; elle rejoint le projet avec son profil unique. Tu peux aussi t'inviter toi-même dans un autre rôle — par exemple si tu montes un film et que tu y joues : ton projet te voit alors avec deux étiquettes (propriétaire ET acteur·ice). Parfait pour l'auto-distribution et les micro-budgets.</p>

          <h3>L'invitation se refuse</h3>
          <p>Inviter quelqu'un ne lui ouvre pas le projet d'office. L'invitation apparaît sur son tableau de bord sous la forme d'une <strong>carte grisée</strong> : en la survolant, la personne découvre la fiche de présentation du film (genre, format, durée, pitch, synopsis) et rien d'autre — ni casting, ni planning, ni budget. Elle choisit alors d'<strong>accepter</strong> ou de <strong>refuser</strong>.</p>
          <p>Tant qu'elle n'a pas répondu, elle apparaît « ⏳ En attente de réponse » dans <em>Gérer les accès &gt; Invités</em>. Le bouton <strong>Révoquer</strong> te sert à annuler l'invitation, et rien ne t'empêche de réinviter plus tard une personne qui avait refusé.</p>
          
          <h3>Temps réel</h3>
          <p>Les modifications se synchronisent instantanément entre tous les membres connectés. Si quelqu'un modifie une scène pendant que tu la regardes, tu vois le changement apparaître.</p>
          <p><strong>🔒 Verrous automatiques :</strong> Pour éviter les conflits d'édition simultanée, le système pose un verrou visuel quand quelqu'un est en train de modifier un élément. Tu vois qui travaille sur quoi.</p>
          <p><strong>👁 Présence :</strong> Les avatars des membres en ligne apparaissent en haut. Tu sais qui est sur le projet en même temps que toi.</p>
          
          <h3>Communication interne</h3>
          <p><strong>💬 Mini-tchat & notifications :</strong> Un tchat éphémère par projet pour les échanges rapides, et des notifications par email (invitations, convocations, relances) pour rester synchro sans jongler avec WhatsApp ou Discord.</p>
          <p><strong>💭 Commentaires :</strong> Sur chaque scène du séquencier pour les discussions créatives. L'historique reste attaché à la scène, tu retrouves facilement pourquoi telle décision a été prise.</p>
          
          <h3>Gestion des permissions</h3>
          <p>Le propriétaire peut à tout moment <strong>changer le rôle</strong> d'un membre (editor → viewer par exemple), ou <strong>retirer l'accès</strong>. Il peut aussi définir des permissions fines par onglet (qui peut éditer quoi).</p>
          <div class="tuto-tip"><strong>⚠️ Contrôle :</strong> Seul le propriétaire peut supprimer le projet ou changer les permissions. Les autres membres peuvent le quitter à tout moment : sur la carte du projet, au tableau de bord, la corbeille est remplacée par une porte 🚪. Quitter ne supprime rien — le propriétaire peut réinviter.</div>
        `
      },
      {
        id: 'fenetres',
        title: '🪟 Fenêtres flottantes',
        content: `
          <h3>Détache tes onglets</h3>
          <p>Dans l'éditeur, fais un <strong>clic droit sur un sous-onglet</strong> puis « 🪟 Ouvrir dans une fenêtre ». Le contenu réel de l'onglet est déplacé dans une fenêtre flottante : déplaçable par sa barre de titre, redimensionnable (8 poignées), réductible dans une barre des tâches en bas et agrandissable en plein cadre. Tes fenêtres ouvertes sont mémorisées et rouvertes au rechargement.</p>

          <h3>Consultation ou Modification</h3>
          <p>Chaque fenêtre naît en <strong>Consultation</strong> (interrupteur gris, bandeau « 👁 Consultation ») : navigation libre, saisie bloquée, et rien n'est signalé aux autres. Bascule l'interrupteur sur <strong>Modification</strong> (vert) pour éditer : la fenêtre pose alors le verrou du domaine, et les collègues voient un badge rouge et passent en lecture seule.</p>
          <p>Si quelqu'un édite déjà ce domaine, ton interrupteur reste bloqué sur Consultation avec l'initiale du détenteur en rouge dans la barre de titre. Le déblocage se fait en direct dès qu'il quitte.</p>

          <h3>Qui regarde quoi</h3>
          <p>Sur le sous-onglet, une pile de badges indique l'activité : <strong>rouge</strong> = la personne qui édite (la main), <strong>bleu</strong> = toi, <strong>gris</strong> = les spectateurs qui consultent. Les badges sont serrés ; survole le sous-onglet pour écarter la pile et tout lire.</p>

          <div class="tuto-tip"><strong>🔓 Libérer le verrou :</strong> repasse en Consultation, ferme la fenêtre ou quitte la page — le domaine redevient aussitôt disponible pour les autres.</div>
        `
      },
      {
        id: 'messages',
        title: '🔔 Notifications & contact',
        content: `
          <h3>Rester au courant</h3>
          <p>Moteur ne contient pas de messagerie interne. Les échanges passent par trois canaux simples : la cloche de notifications, le mini-tchat d'un projet, et les emails automatiques.</p>

          <h3>🔔 La cloche de notifications</h3>
          <p>Dans le header, une <strong>cloche 🔔</strong> t'alerte en temps réel : invitation à un projet, ajout ou retrait sur un projet, commentaire sur une de tes scènes, ou demande de la main sur une section verrouillée.</p>
          <p>Clique dessus pour voir l'historique ; les non-lues ont une pastille rouge. Le bouton <strong>🗑 Effacer</strong> vide tes notifications.</p>

          <h3>💬 Le mini-tchat du projet</h3>
          <p>Dans un projet, la bulle en bas à gauche ouvre un <strong>tchat éphémère</strong> entre les personnes connectées : idéal pour les échanges rapides pendant qu'on travaille. Les messages (et fichiers joints) sont automatiquement purgés au-delà de 24 h — rien n'est archivé.</p>

          <h3>✉️ Contacter quelqu'un</h3>
          <p>Depuis l'Univers, ouvre une fiche puis utilise le <strong>contact public</strong> que la personne a choisi d'exposer (email ou téléphone). Tu la contactes par ton propre outil (mail, SMS) — l'adresse de ton compte n'est jamais dévoilée.</p>

          <h3>📧 Emails automatiques</h3>
          <p>Certaines actions envoient un email à la personne concernée, qu'elle ait un compte ou non : invitation à un projet, ajout depuis la recherche, demande de collaboration, revendication de fiche, feuilles de service et convocations (date / lieu / heure), relances (contrat, fiche incomplète).</p>

          <div class="tuto-tip"><strong>🛡️ Modération :</strong> En cas de contenu inapproprié, signale le profil via le bouton 🚩 sur sa fiche. L'équipe Moteur modère et peut attribuer des avertissements (jaune), suspensions (rouge) ou bannissements (noir).</div>
        `
      },
      {
        id: 'rapports',
        title: '📊 Rapports de script',
        content: `
          <h3>Le journal de tournage</h3>
          <p>Le <strong>rapport de script</strong> (ou "script continuity") est un outil essentiel pendant le tournage. Il consigne pour chaque plan tourné : les prises réalisées, leur qualité, les raccords, les choix de la réal...</p>
          
          <h3>Organisation</h3>
          <p>Dans l'onglet <em>Rapports</em>, tu retrouves à gauche <strong>toutes les scènes et leurs plans</strong>. Clique sur un plan pour remplir sa fiche.</p>
          <p>Les plans proviennent automatiquement du storyboard. Si tu as pensé ton découpage, le rapport est déjà structuré.</p>
          
          <h3>Fiche d'un plan</h3>
          <p>Pour chaque plan, tu remplis :</p>
          <ul>
            <li><strong>Infos générales</strong> (numéro, type, description) — auto-remplies depuis le storyboard</li>
            <li><strong>Dialogues</strong> de la scène — auto-remplis depuis le scénario</li>
            <li><strong>Caméra/Son/Lumière</strong> : matos, réglages, remarques techniques</li>
            <li><strong>Prises :</strong> ajoute autant de prises que nécessaire avec le bouton <em>+ Prise</em></li>
          </ul>
          
          <h3>Gestion des prises</h3>
          <p>Pour chaque prise : <strong>numéro son, numéro image, qualité son, qualité image, qualité du jeu, notes</strong>. Tu peux aussi <strong>⭐ étoiler</strong> la prise qui est la bonne (celle à monter).</p>
          <div class="tuto-tip"><strong>💡 Sur le plateau :</strong> La script rempli le rapport en temps réel pendant les tournages. Chaque prise est ajoutée instantanément, visible par l'équipe entière grâce à la synchronisation.</div>
          
          <h3>Exports pro</h3>
          <p><strong>📄 Export PDF (plan par plan) :</strong> Le rapport complet d'un plan pour archive.</p>
          <p><strong>📦 Export Tous :</strong> Tous les rapports du projet en un seul PDF, prêt pour la régie ou le montage.</p>
          <div class="tuto-tip"><strong>⚡ Gain de temps montage :</strong> Le monteur reçoit un document complet avec les bonnes prises étoilées. Il sait exactement quoi charger dans sa timeline.</div>
        `
      },
      {
        id: 'export',
        title: '📤 Exports',
        content: `
          <h3>Tous les formats pro</h3>
          <p><strong>Scénario :</strong> PDF formaté, Fountain, Final Draft FDX</p>
          <p><strong>Autres :</strong> Séquencier, casting, équipe, décors en PDF. Budget en Excel. Storyboard en grille PDF. MoodBoard en PNG/PDF.</p>
          <p><strong>Rapport de production :</strong> Compile stats, équipe, budget, planning en un document de synthèse.</p>
          <div class="tuto-tip"><strong>💡 Export ZIP :</strong> Tous tes PDFs et CSVs dans un dossier, avec fichier projet JSON pour backup/transfert.</div>
        `
      },
      {
        id: 'personnalisation',
        title: '🎨 Personnalisation',
        content: `
          <h3>Fais de Moteur TON outil</h3>
          <p><strong>Mode clair / sombre :</strong> bascule en un clic depuis le header. Ton choix est sauvegardé et te suit sur tous tes appareils.</p>
          <p><strong>Onglets sur mesure :</strong> dans un projet, glisse-dépose les onglets pour les réordonner, change leurs couleurs, et masque ceux que tu n'utilises pas (croix sur l'onglet, menu « ⊕ Masqués » pour les retrouver).</p>
        `
      }
    ],

    currentSection: 'intro',
    
    // ===================== AFFICHAGE & AIDE =====================
    open: () => {
      const overlay = document.getElementById('tuto-modal-overlay');
      overlay.classList.add('show');
      Tutorial.renderSidebar();
      Tutorial.showSection('intro');
    },
    
    close: () => {
      document.getElementById('tuto-modal-overlay').classList.remove('show');
    },
    
    renderSidebar: () => {
      const sidebar = document.getElementById('tuto-sidebar');
      sidebar.innerHTML = Tutorial.sections.map(s => `
        <div class="tuto-sidebar-item ${s.id === Tutorial.currentSection ? 'active' : ''}" 
             onclick="app.Tutorial.showSection('${s.id}')">
          ${s.title}
        </div>
      `).join('');
    },
    
    // Ouvre le guide complet directement sur une section donnee (repli : debut)
    openAt: (sectionId) => {
      Tutorial.open();
      if(sectionId && Tutorial.sections.some(s => s.id === sectionId)) {
          Tutorial.showSection(sectionId);
      }
    },

    showSection: (id) => {
      Tutorial.currentSection = id;
      const section = Tutorial.sections.find(s => s.id === id);
      if(section) {
        document.getElementById('tuto-content').innerHTML = section.content;
      }
      Tutorial.renderSidebar();
    }
  };

  Icons.init();
  setTimeout(Auth.init, 50);

  // ===== RACCOURCIS CLAVIER =====
  // Filet de sécurité : quand le plein écran se termine par un chemin que
  // PresentMode.exit() ne voit pas (Échap traité nativement par le
  // navigateur avant notre propre écouteur clavier, touche F11, bouton du
  // navigateur), le bandeau noir restait affiché car seule la classe
  // 'presentation-mode' du body pilote sa visibilité — fullscreenchange
  // se déclenche lui de façon fiable, quelle que soit la cause de la sortie.
  document.addEventListener('fullscreenchange', () => {
      if(!document.fullscreenElement && PresentMode.isActive) {
          document.body.classList.remove('presentation-mode');
          PresentMode.isActive = false;
      }
  });

  document.addEventListener('keydown', (e) => {
      // Échap - Fermer les modales
      if(e.key === 'Escape') {
          // Quitter mode présentation en priorité
          if(PresentMode.isActive) {
              PresentMode.exit();
              return;
          }
          // Fermer modal profil
          const profileModal = document.getElementById('profile-modal-overlay');
          if(profileModal && profileModal.style.display !== 'none') {
              Universe.closeProfileModal();
              return;
          }
          // Fermer modal sélection projet
          const selectProjectModal = document.getElementById('select-project-modal');
          if(selectProjectModal && selectProjectModal.style.display !== 'none') {
              selectProjectModal.style.display = 'none';
              return;
          }
          // Fermer modal partage
          const shareModal = document.getElementById('share-modal');
          if(shareModal && shareModal.style.display !== 'none') {
              shareModal.style.display = 'none';
              return;
          }
          // Fermer modal export
          const exportModal = document.getElementById('export-modal');
          if(exportModal && exportModal.style.display !== 'none') {
              exportModal.style.display = 'none';
              return;
          }
          // Fermer modal tag
          const tagModal = document.getElementById('tag-modal');
          if(tagModal && tagModal.style.display !== 'none') {
              tagModal.style.display = 'none';
              return;
          }
          // Fermer menu couleur onglet
          const tabColorMenu = document.getElementById('tab-color-menu');
          if(tabColorMenu && tabColorMenu.classList.contains('visible')) {
              UI.closeTabColorMenu();
              return;
          }
      }
      
      // Ctrl+S - Sauvegarder
      if(e.ctrlKey && e.key === 's') {
          e.preventDefault();
          if(state.currentProjectId && els.appView.style.display !== 'none') {
              Store.save();
              Utils.toast('Projet sauvegardé !', 'success');
          } else if(document.getElementById('public-profile-view')?.classList.contains('active')) {
              PublicProfile.saveCurrentProfile();
          }
          return;
      }
      
      // Ignorer Shift seul en Vue Script (éviter perte de focus)
      if(e.key === 'Shift') {
          const continuousContainer = document.getElementById('scriptContinuousContainer');
          if(continuousContainer && continuousContainer.style.display !== 'none') {
              e.preventDefault();
              e.stopPropagation();
              return;
          }
      }
      
      // Ctrl+flèches - Navigation onglets (seulement dans l'app)
      if(e.ctrlKey && els.appView.style.display !== 'none') {
          const tabs = Array.from(document.querySelectorAll('.tab-btn'));
          const activeIndex = tabs.findIndex(t => t.classList.contains('active'));
          
          if(e.key === 'ArrowRight' && activeIndex < tabs.length - 1) {
              e.preventDefault();
              tabs[activeIndex + 1].click();
          } else if(e.key === 'ArrowLeft' && activeIndex > 0) {
              e.preventDefault();
              tabs[activeIndex - 1].click();
          }
      }
  });
