
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
      zones: '.data-card[data-fiche]',
      idDe: (el) => el.getAttribute('data-fiche') || ''
  });

  // La cle de collection derriere une espece, et l'inverse. Le verrou parle en
  // « character », l'enregistrement en « characters ».
  FicheLock.COLL = { character: 'characters', actor: 'actors' };

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
