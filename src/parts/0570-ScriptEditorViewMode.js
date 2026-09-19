
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