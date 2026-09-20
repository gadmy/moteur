
  // ==========================================================================
  //  CE QUI A BOUGE AUTOUR DE MOI (v601) — etape 4
  // ==========================================================================
  //  Le verrou par scene traite les VRAIS conflits : deux personnes ne peuvent
  //  plus ecrire la meme scene. Restent les changements qui n'en sont PAS :
  //  quelqu'un deplace ma scene, change son decor, y ajoute un personnage.
  //  Rien de tout cela ne m'empeche d'ecrire — mais si personne ne me le DIT,
  //  je decouvre a l'export que ma scene 12 est devenue la 4 et se joue dans
  //  une cuisine. C'est la troisieme nature d'etat de l'analyse : on ne
  //  verrouille pas, on PREVIENT.
  //
  //  DEUX REGLES POUR NE PAS DEVENIR UN BRUIT DE FOND :
  //  1. On ne parle que de MA scene — celle que je tiens, ou celle ou est mon
  //     curseur, ou celle dont la fiche est ouverte. Un projet a cinquante
  //     scenes ; annoncer les quarante-neuf autres, c'est n'annoncer rien.
  //  2. Un seul bandeau a la fois, qui s'efface tout seul. Il ne bloque rien,
  //     ne prend aucun clic hors de sa croix, et disparait au bout de quinze
  //     secondes. Une information qu'il faut fermer est une corvee.
  const SceneNews = {
      DUREE: 15000,
      _enAttente: [],
      _minuteur: null,

      // La scene qui me concerne, dans l'ordre : celle que je TIENS (intention
      // d'ecrire la plus nette), puis celle ou est mon curseur, puis celle dont
      // la fiche est ouverte.
      _maScene: () => {
          try {
              if(typeof SceneLock !== 'undefined') {
                  const tenue = Object.keys(SceneLock.tous()).find(id => SceneLock.tenueParMoi(id));
                  if(tenue) return String(tenue);
                  const curseur = SceneLock._sceneDuCurseur();
                  if(curseur) return String(curseur);
              }
              if(state.currentEditingId) return String(state.currentEditingId);
          } catch(e) {}
          return '';
      },

      _nomDecor: (id) => {
          if(!id) return '';
          const l = (state.data.locations || []).find(x => x && String(x.id) === String(id));
          return (l && l.name) || '';
      },
      _nomsPersos: (ids) => (ids || []).map(id => {
          const c = (state.data.characters || []).find(x => x && String(x.id) === String(id));
          return (c && c.name) || '';
      }).filter(Boolean),

      // ------------------------------------------------------------------
      //  DETECTION. Appelee AVANT la fusion, seul moment ou l'on dispose des
      //  deux etats : « base » (ce que le serveur m'avait envoye) et
      //  « distantes » (ce qu'il m'envoie maintenant). Apres la fusion il est
      //  trop tard, les deux sont confondus.
      // ------------------------------------------------------------------
      detecter: (base, distantes) => {
          try {
              const id = SceneNews._maScene();
              if(!id || !Array.isArray(base) || !Array.isArray(distantes)) return;
              const iAvant = base.findIndex(s => s && String(s.id) === id);
              if(iAvant === -1) return;                 // scene que je ne connaissais pas
              const avant = base[iAvant];
              const iApres = distantes.findIndex(s => s && String(s.id) === id);

              if(iApres === -1) {
                  SceneNews._ajouter('🗑️ Cette scène vient d\'être supprimée par quelqu\'un d\'autre. '
                      + 'Ce que vous écrivez ici ne sera pas enregistré — copiez votre texte avant de quitter.', 'danger');
                  return;
              }
              const apres = distantes[iApres];

              if(iApres !== iAvant) {
                  SceneNews._ajouter('↕️ Votre scène a été déplacée : elle est maintenant en position '
                      + (iApres + 1) + ' (elle était en ' + (iAvant + 1) + ').');
              }
              if(String(avant.number || '') !== String(apres.number || '')) {
                  SceneNews._ajouter('🔢 Le numéro de votre scène est passé de ' + (avant.number || '?')
                      + ' à ' + (apres.number || '?') + '.');
              }
              if(String(avant.locationId || '') !== String(apres.locationId || '')) {
                  const ancien = SceneNews._nomDecor(avant.locationId);
                  const neuf = SceneNews._nomDecor(apres.locationId);
                  SceneNews._ajouter('📍 Le décor de votre scène a changé' + (neuf ? ' : ' + neuf : '')
                      + (ancien ? ' (avant : ' + ancien + ')' : '') + '.');
              }
              const pAvant = Array.isArray(avant.persoIds) ? avant.persoIds.map(String) : [];
              const pApres = Array.isArray(apres.persoIds) ? apres.persoIds.map(String) : [];
              const ajoutes = SceneNews._nomsPersos(pApres.filter(x => pAvant.indexOf(x) === -1));
              const retires = SceneNews._nomsPersos(pAvant.filter(x => pApres.indexOf(x) === -1));
              if(ajoutes.length) SceneNews._ajouter('👤 Personnage ajouté à votre scène : ' + ajoutes.join(', ') + '.');
              if(retires.length) SceneNews._ajouter('👤 Personnage retiré de votre scène : ' + retires.join(', ') + '.');
          } catch(e) { console.warn('[SceneNews] detection :', e && e.message); }
      },

      _ajouter: (texte, ton) => { SceneNews._enAttente.push({ texte: texte, ton: ton || 'info' }); },

      // ------------------------------------------------------------------
      //  AFFICHAGE. Appele APRES le rendu : une mise a jour distante redessine
      //  l'onglet et effacerait un bandeau pose trop tot — c'est exactement le
      //  defaut corrige en v570 sur les bandeaux de verrou.
      // ------------------------------------------------------------------
      afficher: () => {
          const messages = SceneNews._enAttente;
          SceneNews._enAttente = [];
          if(!messages.length) return;
          const hote = document.querySelector('.tab-content.active');
          if(!hote) return;
          const vieux = hote.querySelector('.scene-news'); if(vieux) vieux.remove();
          clearTimeout(SceneNews._minuteur);

          const grave = messages.some(m => m.ton === 'danger');
          const bloc = document.createElement('div');
          bloc.className = 'scene-news' + (grave ? ' scene-news--grave' : '');
          const corps = document.createElement('div');
          corps.className = 'scene-news-corps';
          messages.forEach(m => {
              const ligne = document.createElement('div');
              ligne.textContent = m.texte;
              corps.appendChild(ligne);
          });
          bloc.appendChild(corps);
          const croix = document.createElement('button');
          croix.className = 'scene-news-fermer';
          croix.type = 'button';
          croix.textContent = '✖';
          croix.title = 'Fermer';
          croix.onclick = () => bloc.remove();
          bloc.appendChild(croix);
          hote.prepend(bloc);
          // Un avertissement de suppression reste : c'est le seul cas ou l'on
          // risque de perdre du texte, il ne doit pas filer sous les yeux.
          if(!grave) SceneNews._minuteur = setTimeout(() => { if(bloc.parentElement) bloc.remove(); }, SceneNews.DUREE);
      }
  };
