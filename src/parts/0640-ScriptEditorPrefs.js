
  const ScriptEditorPrefs = {
      // Ouvre la modale de paramètres éditeur scénario (Tab/Enter customisables)
      openModal: () => {
          const p = state.scriptPrefs;
          UI.showModal({
              title: '⚙️ Paramètres éditeur scénario',
              html: `
                  <div style="display:flex; flex-direction:column; gap:14px;">
                      <div>
                          <label class="form-label-block" style="font-weight:600; margin-bottom:6px;">Après <strong>Dialogue</strong> (ligne remplie) + Entrée :</label>
                          <select id="pref-enterAfterDialog" class="actor-input">
                              <option value="sc-perso" ${p.enterAfterDialog === 'sc-perso' ? 'selected' : ''}>Nouvelle ligne Personnage (défaut moteur)</option>
                              <option value="sc-action" ${p.enterAfterDialog === 'sc-action' ? 'selected' : ''}>Nouvelle ligne Action (standard Final Draft)</option>
                          </select>
                      </div>
                      <div>
                          <label class="form-label-block" style="font-weight:600; margin-bottom:6px;">Après <strong>Action</strong> (ligne remplie) + Entrée :</label>
                          <select id="pref-enterAfterAction" class="actor-input">
                              <option value="sc-action" ${p.enterAfterAction === 'sc-action' ? 'selected' : ''}>Nouvelle ligne Action (défaut)</option>
                              <option value="sc-perso" ${p.enterAfterAction === 'sc-perso' ? 'selected' : ''}>Nouvelle ligne Personnage (style ping-pong dialogue)</option>
                          </select>
                      </div>
                      <div>
                          <label class="form-label-block" style="font-weight:600; margin-bottom:6px;">Tab depuis un bloc <strong>Dialogue</strong> :</label>
                          <select id="pref-tabFromDialog" class="actor-input">
                              <option value="sc-perso" ${p.tabFromDialog === 'sc-perso' ? 'selected' : ''}>→ Personnage (défaut moteur)</option>
                              <option value="sc-action" ${p.tabFromDialog === 'sc-action' ? 'selected' : ''}>→ Action (standard Final Draft)</option>
                          </select>
                      </div>
                      <hr style="border:none; border-top:1px solid var(--border); margin:0;">
                      <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                          <input type="checkbox" id="pref-doubleTapTabToNote" ${p.doubleTapTabToNote ? 'checked' : ''} style="width:auto;">
                          <span><strong>Double Tab rapide → Note</strong> <span style="color:var(--text-sec); font-size:0.85rem;">(raccourci moteur)</span></span>
                      </label>
                      <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                          <input type="checkbox" id="pref-doubleEnterToTransition" ${p.doubleEnterToTransition ? 'checked' : ''} style="width:auto;">
                          <span><strong>Double Entrée rapide depuis Action → Transition</strong> <span style="color:var(--text-sec); font-size:0.85rem;">(raccourci moteur)</span></span>
                      </label>
                  </div>
              `,
              confirmText: 'Enregistrer',
              onConfirm: () => {
                  state.scriptPrefs.enterAfterDialog = document.getElementById('pref-enterAfterDialog').value;
                  state.scriptPrefs.enterAfterAction = document.getElementById('pref-enterAfterAction').value;
                  state.scriptPrefs.tabFromDialog = document.getElementById('pref-tabFromDialog').value;
                  state.scriptPrefs.doubleTapTabToNote = document.getElementById('pref-doubleTapTabToNote').checked;
                  state.scriptPrefs.doubleEnterToTransition = document.getElementById('pref-doubleEnterToTransition').checked;
                  PreferencesSync.save('moteur_script_prefs', JSON.stringify(state.scriptPrefs));
                  Utils.toast('Paramètres enregistrés', 'success');
                  return true;
              }
          });
      }
  };
