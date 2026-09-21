
  // ==========================================================================
  //  VERROU PAR SECTION DE SYNOPSIS (v601)
  // ==========================================================================
  //  L'onglet Synopsis porte SIX textes independants : le synopsis, le resume
  //  court, le resume long, la note d'intention, la note du realisateur et celle
  //  du producteur. Jusqu'ici un seul verrou les couvrait tous : la productrice
  //  qui redige sa note bloquait le realisateur sur la sienne, alors qu'ils
  //  n'ecrivent pas au meme endroit. C'est precisement ce que les verrous fins
  //  savent regler.
  //
  //  LES DONNEES ETAIENT DEJA PRETES, et c'est ce qui rend ce cas simple : les
  //  six textes sont six CLES SEPAREES de l'enregistrement, et la sauvegarde
  //  n'envoie que les cles modifiees. Deux personnes sur deux sections ne
  //  s'ecrasaient donc deja pas cote serveur — seul le verrou d'onglet les
  //  empechait de travailler en meme temps. Le retirer ne fait perdre aucune
  //  securite ; il ne restait qu'a proteger le cas reel, DEUX PERSONNES SUR LA
  //  MEME SECTION, ou la derniere ecriture gagne.
  //
  //  RIEN A AJOUTER AU HTML : chaque section porte deja data-section depuis
  //  toujours, pour la navigation entre les six textes. On s'en sert tel quel.
  const SynopsisLock = VerrouFin.creer({
      nom: 'SynopsisLock',
      prefixe: 'synopsis:',
      zones: '.synopsis-section[data-section]',
      idDe: (el) => el.getAttribute('data-section') || ''
  });

  // La cle d'enregistrement derriere une section, et l'inverse. Le verrou parle
  // en sections (« short »), la sauvegarde en cles (« synopsisShort ») : sans
  // cette traduction, le refus d'ecriture ne saurait pas quoi refuser.
  SynopsisLock.cleDonnee = (section) => {
      try {
          const f = Synopsis.FIELDS[section];
          return (f && f.key) || '';
      } catch(e) { return ''; }
  };
  SynopsisLock.sectionDeCle = (cle) => {
      try {
          for(const t in Synopsis.FIELDS) { if(Synopsis.FIELDS[t].key === cle) return t; }
      } catch(e) {}
      return '';
  };

  // Les cles d'enregistrement tenues par QUELQU'UN D'AUTRE : { cle -> qui }.
  // Lue par la sauvegarde, qui les retire de ce qu'elle s'apprete a envoyer.
  SynopsisLock.clesInterdites = () => {
      const out = {};
      try {
          const tenues = SynopsisLock.tous();
          for(const section in tenues) {
              const l = tenues[section];
              if(!l || LockManager._mine(l)) continue;
              const cle = SynopsisLock.cleDonnee(section);
              if(cle) out[cle] = LockManager._who(l);
          }
      } catch(e) {}
      return out;
  };
