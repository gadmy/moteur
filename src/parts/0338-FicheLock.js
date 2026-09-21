
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
      zones: '.data-card[data-fiche], .crew-card[data-fiche]',
      idDe: (el) => el.getAttribute('data-fiche') || ''
  });

  // La cle de collection derriere une espece, et l'inverse. Le verrou parle en
  // « character », l'enregistrement en « characters ».
  // Les especes couvertes. Une espece n'entre ici QUE si ses fiches se
  // modifient directement sur leur carte : c'est la que le curseur se pose,
  // donc la que le verrou s'accroche. Verifie avant d'ajouter — personnages,
  // comediens, decors et equipe portent de dix a vingt champs sur la carte ;
  // ressources, structures et plans de storyboard n'en portent AUCUN (ils se
  // modifient dans une fenetre), et leur retirer le verrou d'onglet aurait
  // donc fait PERDRE de la securite au lieu d'en gagner. C'est exactement le
  // piege des scenes, ou le refus etait pose sur un chemin que personne
  // n'empruntait.
  FicheLock.COLL = { character: 'characters', actor: 'actors', location: 'locations', crew: 'crew' };

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
