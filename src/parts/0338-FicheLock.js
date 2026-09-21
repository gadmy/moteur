
  // ==========================================================================
  //  VERROU PAR FICHE — PERSONNAGES ET COMEDIENS (v601)
  // ==========================================================================
  //  Troisieme famille de verrous fins, apres les scenes et les sections de
  //  synopsis. Le mecanisme est commun (VerrouFin) ; il n'y a ici que ce qui
  //  est propre aux fiches.
  //
  //  POURQUOI CEUX-LA D'ABORD. Recensement du 21 septembre : sur dix-neuf
  //  onglets, sept se pretent au verrou fin parce que ce sont des LISTES DE
  //  FICHES — exactement le cas des scenes. Parmi eux, le casting est celui ou
  //  deux personnes travaillent VRAIMENT en meme temps : on remplit une
  //  distribution a plusieurs, on ne redige pas un contrat a deux. Un verrou
  //  fin ne vaut que la ; ailleurs il ajoute du code sans rien regler.
  //
  //  UNE SEULE FAMILLE POUR PLUSIEURS ESPECES. La clef porte l'espece :
  //  « fiche:character:<id> », « fiche:actor:<id> ». Ajouter les decors ou
  //  l'equipe demain, c'est poser l'attribut sur leur carte et retirer leur
  //  verrou d'onglet — rien d'autre.
  //
  //  UNE SEULE PORTE DE RENDU, ET C'EST CE QUI REND LA CHOSE SURE :
  //  UIData.renderDataCards dessine la carte de la LISTE **et** le contenu de
  //  la FICHE ouverte en fenetre (CardModal.open reutilise ce rendu). Poser
  //  l'attribut a cet endroit couvre donc les deux ecrans d'un coup. C'est la
  //  lecon des scenes, ou l'on avait nomme sept zones une par une.
  const FicheLock = VerrouFin.creer({
      nom: 'FicheLock',
      prefixe: 'fiche:',
      // La carte d'equipe ne porte pas la meme classe que les autres : elle est
      // dessinee par une fonction a part. On NOMME donc les deux, plutot que de
      // se fier a « tout element portant data-fiche » — c'est ce qui avait fait
      // atterrir le badge des scenes sur des pastilles de commentaire et des
      // cases d'export.
      // Trois formes de zone, nommees une par une :
      //   .data-card / .crew-card  — les cartes de liste ou l'on modifie
      //                              directement (personnages, comediens,
      //                              decors, equipe) ;
      //   .compact-card            — les cartes de liste qui ne servent qu'a
      //                              MONTRER (ressources, structures) : on les
      //                              marque pour que le cadenas s'y voie, mais
      //                              le verrou se prend dans leur fenetre ;
      //   .fiche-fenetre           — l'enveloppe posee dans le corps d'une
      //                              fenetre d'edition, la ou se trouvent les
      //                              champs. Elle vit dans le contenu, donc
      //                              elle disparait quand on ouvre autre chose.
      zones: '.data-card[data-fiche], .crew-card[data-fiche], .compact-card[data-fiche], .shot-card[data-fiche], .moodboard-board-tab[data-fiche], #moodboardCanvasWrapper[data-fiche], .ccol-ctr[data-fiche], .sr-fiche[data-fiche], .sr-sheet[data-fiche], #shotEditContent[data-fiche], #drawing-modal[data-fiche], .fiche-fenetre[data-fiche]',
      // Le verrou se PREND la ou l'on ecrit : sur les cartes modifiables et
      // dans les fenetres. Parcourir une liste de ressources ne verrouille rien.
      zonesEcriture: '.data-card[data-fiche], .crew-card[data-fiche], .sr-sheet[data-fiche], #shotEditContent[data-fiche], .fiche-fenetre[data-fiche]',
      idDe: (el) => el.getAttribute('data-fiche') || ''
  });

  // ======================================================================
  //  ON PREND LE VERROU EN OUVRANT LA FICHE (v601)
  // ======================================================================
  //  La porte unique : UI.openFiche, par ou passent les onze familles. Les
  //  quelques editeurs qui ne s'ouvrent pas par la (ressource, structure,
  //  contrat, plan, rapport, planche) appellent ceci directement.
  //  ON NE PREND RIEN EN LECTURE SEULE : consulter ne doit bloquer personne.
  //  ET RIEN NON PLUS si quelqu'un d'autre la tient deja — le badge le dit,
  //  inutile d'insister.
  //  ET L'ON PREVIENT AVANT D'ENTRER, PAS APRES (v601). Premiere version :
  //  ouvrir une fiche deja tenue ne prenait rien, mais la fiche s'ouvrait
  //  quand meme — on se retrouvait dedans, a lire des champs qu'on ne pouvait
  //  pas enregistrer, sans savoir pourquoi. Remarque du developpeur :
  //  « on doit etre prevenu AVANT de rentrer dans une fiche qu'elle est
  //  occupee ». C'est aussi la seule facon tenable pour l'editeur de dessin :
  //  il contient des dizaines de boutons, les neutraliser un par un serait une
  //  usine a gaz — on garde la porte fermee, et le cadenas se voit DEHORS, sur
  //  la vignette du plan.
  //  RENVOIE false QUAND IL FAUT RENONCER A OUVRIR, true sinon. En cas de
  //  doute (famille inconnue, panne) on renvoie true : un verrou qui n'a pas
  //  marche ne doit jamais empecher de travailler.
  FicheLock.occupeePar = (espece, id) => {
      try {
          if(!espece || !id || !FicheLock.COLL[espece]) return '';
          const l = FicheLock.detenteur(espece + ':' + id);
          return l ? (LockManager._who(l) || 'quelqu\'un') : '';
      } catch(e) { return ''; }
  };

  FicheLock.ouvrir = (espece, id, libelle) => {
      try {
          if(!espece || !id) return true;
          if(!FicheLock.COLL[espece]) return true;     // famille sans verrou fin
          // Simple lecture : on n'ouvre rien a personne et on ne prend rien.
          // Consulter une fiche ne doit bloquer ni soi-meme ni les autres.
          if(state.currentRole === 'viewer') return true;
          if(typeof Permissions !== 'undefined' && Permissions.canEditFiche
             && !Permissions.canEditFiche(espece)) return true;
          const qui = FicheLock.occupeePar(espece, id);
          if(qui) {
              Utils.toast('🔒 ' + (libelle || 'Cette fiche') + ' est ouverte par ' + qui
                          + '. Réessayez quand la personne l\'aura quittée.', 'error', 5000);
              return false;
          }
          FicheLock.prendreParPorte(espece + ':' + id);
          return true;
      } catch(e) { console.warn('[FicheLock] ouverture :', e && e.message); return true; }
  };

  // La cle de collection derriere une espece, et l'inverse. Le verrou parle en
  // « character », l'enregistrement en « characters ».
  // Les especes couvertes. LA CONDITION N'EST PAS « la carte est modifiable »,
  // c'est « il existe QUELQUE PART une zone ou le curseur se pose pour modifier
  // cette fiche ». Premiere lecture : les ressources et les structures n'ont
  // aucun champ sur leur carte, donc on les avait laissees de cote. Remarque
  // juste du developpeur : ce sont des fiches comme les autres, et leur FENETRE
  // est pleine de champs. C'est la fenetre qu'il fallait marquer — ce qu'on
  // avait deja fait pour la fiche de scene sans en tirer la regle.
  // Le plan de storyboard va plus loin encore : on y dessine a la SOURIS, le
  // curseur de texte ne s'y pose jamais. Son verrou se prend donc A LA PORTE,
  // quand l'editeur de dessin s'ouvre (voir DrawingEditor.open).
  FicheLock.COLL = { character: 'characters', actor: 'actors', location: 'locations',
                     crew: 'crew', resource: 'resources', org: 'orgs', shot: 'shots',
                     board: 'moodboards', contract: 'contracts', rapport: 'scriptReports' };

  // Les fiches tenues par QUELQU'UN D'AUTRE, rangees par collection :
  // { characters: { id -> qui }, actors: { ... } }. Lue par la sauvegarde, qui
  // reprend la version du serveur pour celles-la.
  FicheLock.interdites = () => {
      const out = {};
      try {
          const tenues = FicheLock.tous();
          for(const cle in tenues) {
              const l = tenues[cle];
              if(!l || LockManager._mine(l)) continue;
              const coupe = String(cle).indexOf(':');
              if(coupe < 0) continue;
              const coll = FicheLock.COLL[cle.slice(0, coupe)];
              if(!coll) continue;
              (out[coll] = out[coll] || {})[cle.slice(coupe + 1)] = LockManager._who(l);
          }
      } catch(e) {}
      return out;
  };
