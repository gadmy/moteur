
  const ScriptImport = {
      openModal: () => {
          // Créer le modal d'import
          const existingModal = document.getElementById('script-import-modal');
          if(existingModal) existingModal.remove();
          
          const modal = document.createElement('div');
          modal.id = 'script-import-modal';
          modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
          modal.innerHTML = `
              <div style="background:var(--panel-bg); border-radius:12px; padding:30px; max-width:500px; width:90%;">
                  <h2 class="mb-20">📄 Importer un scénario</h2>
                  <p class="text-sec-mb20">Importez un fichier PDF ou Final Draft (.fdx) pour ajouter des scènes à votre projet.</p>
                  <p style="color:orange; font-size:0.9rem; margin-bottom:20px;">⚠️ Attention : l'import remplacera les scènes existantes.</p>
                  <div style="display:flex; flex-direction:column; gap:15px;">
                      <label style="display:flex; flex-direction:column; gap:8px; padding:20px; border:2px dashed var(--border); border-radius:8px; cursor:pointer; text-align:center; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                          <span style="font-size:2rem;">📄</span>
                          <span class="fw-600">Choisir un fichier PDF ou FDX</span>
                          <span class="text-sec-sm2">Formats supportés : .pdf, .fdx, .xml</span>
                          <input type="file" accept=".pdf,.fdx,.xml" onchange="app.ScriptImport.handleFile(event)" class="d-none">
                      </label>
                  </div>
                  <div class="flex-end-mt20">
                      <button onclick="document.getElementById('script-import-modal').remove();" class="btn btn--secondary btn--r8">Annuler</button>
                  </div>
              </div>
          `;
          document.body.appendChild(modal);
      },
      
      handleFile: (e) => {
          const file = e.target.files[0];
          if(!file) return;
          
          // Fermer le modal
          document.getElementById('script-import-modal')?.remove();
          
          // Utiliser le parseur existant
          if(file.name.toLowerCase().endsWith('.pdf')) {
              Importer.parsePDF(file);
          } else if(file.name.toLowerCase().endsWith('.fdx') || file.name.toLowerCase().endsWith('.xml')) {
              const reader = new FileReader();
              reader.onload = (ev) => Importer.parseFDX(ev.target.result);
              reader.readAsText(file);
          } else {
              Utils.toast("Format non supporté. Utilisez PDF ou FDX.", "error");
          }
      }
  };

  // ScriptEditorViewMode — sous-module V7.3, allégé en v619 (Vue Scènes retirée,
  // il ne reste que la Vue Script). Conservé sous ce nom pour ne pas casser les
  // appels existants (Actions.finalizeScene, ScriptEditorEpisodes.switch, etc.)