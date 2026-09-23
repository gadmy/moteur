
  // ScriptEditorViewMode — sous-module V7.3, allégé en v619 (Vue Scènes retirée,
  // il ne reste que la Vue Script). Conservé sous ce nom pour ne pas casser les
  // appels existants (Actions.finalizeScene, ScriptEditorEpisodes.switch, etc.)
  const ScriptEditorViewMode = {
      init: () => {
          // v619 : on ignore délibérément toute préférence 'scenes' enregistrée
          // (localStorage / PreferencesSync) d'une session précédente — cet
          // écran n'existe plus, la Vue Script est désormais la seule option.
          ScriptEditorViewMode.set('continuous');
      },
      
      set: (mode) => {
          ScriptEditor.viewMode = 'continuous';
          ScriptEditor.renderContinuous();
          ScriptEditor.updateCount();
      }
  };

  // ScriptEditorEpisodes — sous-module V7.4 : sélecteurs saison/épisode (séries) + bascule d'épisode