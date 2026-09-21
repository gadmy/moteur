
  const ConfirmModal = {
      // Affiche une modale de confirmation
      show: (options) => {
          return new Promise((resolve) => {
              const { title = 'Confirmation', message = 'Êtes-vous sûr ?', icon = '❓', confirmText = 'Confirmer', cancelText = 'Annuler', type = 'confirm', inputPlaceholder = '', inputValue = '', inputType = 'text', dangerous = false, hideCancel = false } = options;
              
              const overlay = document.createElement('div');
              overlay.className = 'confirm-modal-overlay';
              // v601 : elle arrivait en fondu et partait d'un coup. La reponse
              // est rendue TOUT DE SUITE — on ne fait pas attendre l'appelant
              // pour une animation — et la fenetre s'efface derriere.
              const fermer = () => {
                  overlay.classList.add('se-ferme');
                  setTimeout(() => { try { overlay.remove(); } catch(e) {} }, 170);
              };
              overlay.onclick = (e) => { if(e.target === overlay) { fermer(); resolve(type === 'prompt' ? null : false); } };
              
              const btnClass = dangerous ? 'danger' : 'confirm';
              const inputHtml = type === 'prompt' ? `<input type="${inputType === 'password' ? 'password' : 'text'}" class="confirm-modal-input" id="confirm-modal-input" placeholder="${inputPlaceholder}" data-tooltip="${inputPlaceholder}" value="${inputValue}">` : '';
              
              overlay.innerHTML = `
                  <div class="confirm-modal-box">
                      <div class="confirm-modal-icon">${icon}</div>
                      <div class="confirm-modal-title">${Utils.escape(title)}</div>
                      <div class="confirm-modal-message">${message}</div>
                      ${inputHtml}
                      <div class="confirm-modal-buttons">
                          ${hideCancel ? '' : `<button class="confirm-modal-btn cancel" id="confirm-modal-cancel">${cancelText}</button>`}
                          <button class="confirm-modal-btn ${btnClass}" id="confirm-modal-ok">${confirmText}</button>
                      </div>
                  </div>
              `;
              
              document.body.appendChild(overlay);
              
              const input = overlay.querySelector('#confirm-modal-input');
              const okBtn = overlay.querySelector('#confirm-modal-ok');
              const cancelBtn = overlay.querySelector('#confirm-modal-cancel');
              
              if(input) { input.focus(); input.select(); input.onkeydown = (e) => { if(e.key === 'Enter') okBtn.click(); if(e.key === 'Escape' && cancelBtn) cancelBtn.click(); }; }
              
              okBtn.onclick = () => { fermer(); resolve(type === 'prompt' ? (input ? input.value : true) : true); };
              if(cancelBtn) cancelBtn.onclick = () => { fermer(); resolve(type === 'prompt' ? null : false); };
              
              // Focus sur le bouton OK si pas d'input
              if(!input) okBtn.focus();
          });
      },
      
      // Raccourci pour confirmation simple
      confirm: (message, title = 'Confirmation', dangerous = false) => {
          return ConfirmModal.show({ title, message, icon: dangerous ? '⚠️' : '❓', dangerous, confirmText: dangerous ? 'Supprimer' : 'Confirmer' });
      },
      
      // Raccourci pour confirmation de suppression
      confirmDelete: (message, title = 'Supprimer ?') => {
          return ConfirmModal.show({ title, message, icon: '🗑️', dangerous: true, confirmText: 'Supprimer' });
      },
      
      // Raccourci pour prompt
      prompt: (message, title = 'Saisie', placeholder = '', defaultValue = '') => {
          return ConfirmModal.show({ title, message, icon: '✏️', type: 'prompt', inputPlaceholder: placeholder, inputValue: defaultValue, confirmText: 'OK' });
      }
  };

  // ==================== DRAG & DROP DE GROUPES ====================
  // Deplacement des cartes compactes entre groupes + suppression des groupes crees.
  // Collections gerees : characters, actors, locations, crew, orgs.