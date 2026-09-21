
  // ==========================================================================
  //  VERROU PAR SCENE (v601)
  // ==========================================================================
  //  Le mecanisme est commun a toutes les familles de verrous fins : il vit
  //  dans VerrouFin. Ici, seulement ce qui est PROPRE AUX SCENES.
  //
  //  CE QU'ON NE VERROUILLE PAS, ET POURQUOI. Les fiches LIEES a la scene
  //  (comedien, personnage, decor, technicien) restent libres. Verrouiller en
  //  cascade paraissait prudent, c'est l'inverse : dans un projet reel de 21
  //  scenes, la realisatrice est rattachee aux 21, et les comediens principaux a
  //  20. Verrouiller une seule scene aurait donc fige presque toutes les fiches
  //  du projet — bien pire qu'avant. Le vrai risque n'est pas qu'on RENOMME un
  //  decor pendant que j'ecris, c'est qu'on l'EFFACE : c'est ca qu'on protege.
  //
  //  LES SOUS-ELEMENTS SONT COUVERTS D'OFFICE : le depouillement, le resume, le
  //  titre, les liens vers les personnages et le decor vivent DANS l'objet
  //  scene. Verrouiller la scene les verrouille tous, partout a la fois.
  //
  //  LES ZONES SONT NOMMEES, ET C'EST TOUT LE SUJET. La premiere version
  //  marquait « tout element portant l'identifiant d'une scene ». Verifie apres
  //  coup : presque rien n'en portait — le depouillement, le sequencier et la
  //  fiche passaient le leur par un onclick. Le verrou ne voyait que le
  //  Scenario, et le badge allait se poser sur les pastilles de commentaire et
  //  dans les listes de choix des exports. On les nomme donc, une fois, ici.
  //  AJOUTER UN ECRAN demain, c'est ajouter une ligne a ZONES — et a
  //  ZONES_ECRITURE s'il permet d'ecrire.
  const SceneLock = VerrouFin.creer({
      nom: 'SceneLock',
      prefixe: 'scene:',
      zones: [
          '.script-continuous-scene[data-scene-id]',   // Scenario
          '#bdScriptContent[data-scene-id]',           // Depouillement, texte
          '#bdRightContent[data-scene-id]',            // Depouillement, fiches
          '.bd-scene-row[data-scene-id]',              // Depouillement, liste
          '.seq-card[data-scene-id]',                  // Sequencier
          '.beatboard-card[data-scene-id]',            // Beat Board
          '.fiche-scene[data-scene-id]'                // Fiche de la scene
      ].join(', '),
      // Les listes et les cartes n'y sont pas : les parcourir, c'est lire.
      zonesEcriture: [
          '.script-continuous-scene[data-scene-id]',
          '#bdScriptContent[data-scene-id]',
          '#bdRightContent[data-scene-id]',
          '.fiche-scene[data-scene-id]'
      ].join(', '),
      idDe: (el) => el.getAttribute('data-scene-id') || ''
  });

  // ----------------------------------------------------------------------
  //  CE QUI N'EXISTE QUE POUR LES SCENES : NE PAS EFFACER SOUS LES PIEDS.
  // ----------------------------------------------------------------------
  //  On a choisi de NE PAS verrouiller les fiches liees (voir l'en-tete).
  //  Reste le vrai danger : pendant que Marc ecrit la scene 12, quelqu'un
  //  SUPPRIME le decor « Cuisine » qu'elle utilise. Renommer ne coute rien —
  //  Marc verra le nouveau nom. Supprimer, si : la scene perd son lien, et Marc
  //  ne s'en apercoit pas avant l'export. On refuse donc la suppression tant
  //  qu'une scene qui s'en sert est tenue. C'est temporaire, pas definitif.
  SceneLock.SCENE_KIND = { characters: 'character', actors: 'actor', locations: 'location', crew: 'crew', resources: 'resource' };

  SceneLock.scenesTenuesLiees = (type, id) => {
      try {
          const kind = SceneLock.SCENE_KIND[type] || type;
          if(!id || typeof UI === 'undefined' || !UI.scenesForFiche) return [];
          const tenues = SceneLock.tous();
          return UI.scenesForFiche(kind, id).filter(s => {
              const l = s && tenues[String(s.id)];
              return !!(l && !LockManager._mine(l));
          });
      } catch(e) { return []; }
  };

  // Renvoie true si la suppression peut se faire ; sinon explique et refuse.
  SceneLock.autoriseSuppression = (type, id) => {
      const bloquantes = SceneLock.scenesTenuesLiees(type, id);
      if(!bloquantes.length) return true;
      const s = bloquantes[0];
      const l = SceneLock.tous()[String(s.id)];
      const qui = l ? LockManager._who(l) : 'quelqu\'un';
      const num = s.number || s.num || s.id;
      Utils.toast('Impossible pour le moment : ' + qui + ' travaille sur la scène ' + num
          + (bloquantes.length > 1 ? ' (et ' + (bloquantes.length - 1) + ' autre' + (bloquantes.length > 2 ? 's' : '') + ')' : '')
          + ', qui utilise cette fiche. Réessayez dans un instant.', 'warning', 8000);
      return false;
  };

  // Refus groupe : supprimer une saison ou un episode emporte toutes ses
  // scenes. Si l'une d'elles est tenue, on refuse le lot entier — on ne
  // supprime pas a moitie.
  SceneLock.autoriseSuppressionScenes = (scenes) => {
      try {
          const tenues = (scenes || []).filter(sc => sc && !SceneLock.peutEcrire(sc.id));
          if(!tenues.length) return true;
          const q = SceneLock.qui(tenues[0].id);
          Utils.toast('Impossible pour le moment : ' + (q || 'quelqu\'un') + ' écrit '
              + (tenues.length > 1 ? tenues.length + ' des scènes concernées' : 'une des scènes concernées')
              + '. Réessayez dans un instant.', 'warning', 8000);
          return false;
      } catch(e) { return true; }
  };
