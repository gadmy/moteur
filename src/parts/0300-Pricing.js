
  const Pricing = {
      // ===================== CONFIG & ABONNEMENT =====================
      // Configuration
      config: {
          trialDurationHours: 48,
          trialGraceDays: 7,
          readOnlyGraceDays: 30
      },
      
      // Vérifier si l'utilisateur a un abonnement actif
      hasActiveSubscription: () => {
          const sub = state.userProfile?.subscription;
          if(!sub || !sub.active) return false;
          if(sub.expiresAt && new Date(sub.expiresAt) < new Date()) return false;
          return true;
      },
      
      // Vérifier si l'utilisateur est en période d'essai
      isInTrial: () => {
          const trial = state.userProfile?.trial;
          if(!trial || !trial.startedAt) return false;
          const trialEnd = new Date(trial.startedAt);
          trialEnd.setHours(trialEnd.getHours() + Pricing.config.trialDurationHours);
          return new Date() < trialEnd;
      },
      
      // Temps restant de l'essai (en ms)
      getTrialTimeRemaining: () => {
          const trial = state.userProfile?.trial;
          if(!trial || !trial.startedAt) return 0;
          const trialEnd = new Date(trial.startedAt);
          trialEnd.setHours(trialEnd.getHours() + Pricing.config.trialDurationHours);
          return Math.max(0, trialEnd - new Date());
      },
      
      // Formater le temps restant
      formatTimeRemaining: (ms) => {
          if(ms <= 0) return 'Expiré';
          const hours = Math.floor(ms / (1000 * 60 * 60));
          const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
          if(hours > 0) return `${hours}h ${minutes}min`;
          return `${minutes} minutes`;
      },
      
      // Compter les collaborateurs d'un projet
      // Un collaborateur = une fiche acteur OU technicien (pas par email unique)
      // ===================== CALCUL DES PRIX =====================
      countCollaborators: (projectData) => {
          if(!projectData) return 0;
          
          // Compter les fiches acteurs avec un nom
          const actorCount = (projectData.actors || []).filter(a => a.name).length;
          
          // Compter les fiches techniciens avec un nom
          const crewCount = (projectData.crew || []).filter(c => c.name).length;
          
          return actorCount + crewCount;
      },
      
      // Calculer le prix mensuel d'un projet
      // 1-5 collaborateurs = 1€, 6-15 = 2€, puis +1€ par tranche de 10
      calculateProjectPrice: (projectData) => {
          const collaborators = Pricing.countCollaborators(projectData);
          
          let price = 0;
          let detail = '';
          
          if(collaborators === 0) {
              price = 0;
              detail = 'Aucun collaborateur';
          } else if(collaborators <= 5) {
              price = 1;
              detail = '1-5 collaborateurs';
          } else if(collaborators <= 15) {
              price = 2;
              detail = '6-15 collaborateurs';
          } else {
              // 16+ : 2€ de base + 1€ par tranche de 10 au-delà de 15
              const extra = Math.ceil((collaborators - 15) / 10);
              price = 2 + extra;
              detail = `16+ collaborateurs (+${extra}€)`;
          }
          
          return {
              collaborators: collaborators,
              price: price,
              detail: detail,
              total: price
          };
      },
      
      // Calculer le prix total mensuel (tous les projets)
      calculateTotalMonthlyPrice: async () => {
          const projects = await Store.getProjectsList();
          const ownedProjects = projects.filter(p => p.role === 'owner');
          
          let totalMonthly = 0;
          const details = [];
          
          for(const project of ownedProjects) {
              // v578 (cloisonnement) : la colonne n'est plus lue directement.
              // Ne concerne que MES projets (filtre role === 'owner' ci-dessus),
              // donc la fonction serveur renvoie tout : le tarif est inchange.
              const { data: projectRow, error: errPr } = await supabase.rpc('project_data_for_me', { p_id: project.id });
              if(errPr) console.warn('[Pricing] project_data_for_me:', errPr);
              const projectData = projectRow || null;
              const price = Pricing.calculateProjectPrice(projectData);
              
              totalMonthly += price.total;
              details.push({
                  id: project.id,
                  title: project.title,
                  ...price
              });
          }
          
          return {
              projectCount: ownedProjects.length,
              totalMonthly,
              details
          };
      },
      
      // Afficher la modale d'abonnement
      // ===================== MODALES & WIDGETS =====================
      showSubscribeModal: (reason) => {
          const modal = document.createElement('div');
          modal.id = 'subscribe-modal';
          modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index: var(--z-modal);display:flex;align-items:center;justify-content:center;padding:20px;';
          modal.innerHTML = `
              <div style="background:var(--panel-bg); border-radius:16px; padding:30px; max-width:600px; width:100%;">
                  <div class="section-header-20">
                      <h2 class="m-0">💳 Abonnement Moteur</h2>
                      <button onclick="document.getElementById('subscribe-modal').remove()" class="icon-btn">✕</button>
                  </div>
                  
                  ${reason ? `<div style="background:#FFF3E0; border:1px solid #FF9800; border-radius:8px; padding:15px; margin-bottom:20px; color:#E65100;">
                      <strong>⚠️ ${reason}</strong>
                  </div>` : ''}
                  
                  <p style="color:var(--text-sec); margin-bottom:25px;">
                      Un tarif simple et transparent, adapté à vos besoins.
                  </p>
                  
                  <div style="background:var(--bg); border-radius:12px; padding:20px; margin-bottom:25px;">
                      <h4 class="mb-15-m0">💰 Tarification par projet</h4>
                      <div style="color:var(--text-sec); font-size:0.9rem;">
                          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">
                              <span>1-5 collaborateurs</span>
                              <strong>1€/mois</strong>
                          </div>
                          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">
                              <span>6-15 collaborateurs</span>
                              <strong>2€/mois</strong>
                          </div>
                          <div style="display:flex; justify-content:space-between; padding:8px 0;">
                              <span>+10 collaborateurs</span>
                              <strong>+1€/mois</strong>
                          </div>
                      </div>
                      <p style="margin:15px 0 0; font-size:0.8rem; color:var(--text-sec);">
                          💡 1 collaborateur = 1 fiche comédien ou technicien
                      </p>
                  </div>
                  
                  <div style="display:flex; gap:10px; justify-content:center;">
                      <button onclick="app.Pricing.subscribe('monthly')" style="flex:1; padding:15px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1rem;">
                          💳 S'abonner
                      </button>
                  </div>
                  
                  <p style="text-align:center; margin-top:15px; font-size:0.8rem; color:var(--text-sec);">
                      💳 Paiement sécurisé par Stripe • Annulation à tout moment
                  </p>
                  
                  <div style="margin-top:15px; padding:15px; background:var(--bg); border-radius:8px; font-size:0.8rem; color:var(--text-sec);">
                      <strong>📋 Modalités :</strong><br>
                      • Résiliation possible à tout moment<br>
                      • Sans renouvellement : 30 jours en lecture seule pour télécharger<br>
                      • Projet supprimé après 30 jours sans abonnement<br>
                      • Vos profils publics restent toujours accessibles
                  </div>
              </div>
          `;
          document.body.appendChild(modal);
      },
      
      // Souscrire (préparation Stripe)
      subscribe: async () => {
          // TODO: Intégrer Stripe Checkout
          Utils.toast('🚧 Paiement Stripe bientôt disponible', 'info');
          document.getElementById('subscribe-modal')?.remove();
      },
      
      // Afficher la bannière d'essai dans le dashboard
      getTrialBanner: () => {
          if(!Pricing.isInTrial()) return '';
          
          const remaining = Pricing.getTrialTimeRemaining();
          const formattedTime = Pricing.formatTimeRemaining(remaining);
          const isUrgent = remaining < 6 * 60 * 60 * 1000; // < 6h
          
          return `
              <div style="background:${isUrgent ? 'linear-gradient(135deg, #ff6b6b, #ee5a24)' : 'linear-gradient(135deg, #667eea, #764ba2)'}; border-radius:12px; padding:15px 20px; margin-bottom:20px; color:white; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                  <div>
                      <strong>⏱️ Période d'essai</strong> - Il vous reste <strong>${formattedTime}</strong>
                  </div>
                  <button onclick="app.Pricing.showSubscribeModal()" style="padding:8px 20px; background:white; color:${isUrgent ? '#ee5a24' : '#667eea'}; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">
                      💳 S'abonner maintenant
                  </button>
              </div>
          `;
      },
      
      // Afficher le résumé de facturation dans le dashboard
      getBillingWidget: async () => {
          if(!Pricing.hasActiveSubscription() && !Pricing.isInTrial()) {
              return '';
          }
          
          const billing = await Pricing.calculateTotalMonthlyPrice();
          
          if(billing.projectCount === 0) {
              return '';
          }
          
          return `
              <div style="background:var(--bg); border-radius:12px; padding:20px; margin-bottom:20px;">
                  <h4 style="margin:0 0 15px; display:flex; align-items:center; gap:10px;">
                      💰 Votre abonnement
                      <span style="font-size:0.8rem; color:var(--text-sec); font-weight:normal;">(estimation)</span>
                  </h4>
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border);">
                      <span>${billing.projectCount} projet${billing.projectCount > 1 ? 's' : ''}</span>
                      <span>${billing.totalMonthly}€/mois</span>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 0; font-weight:bold; font-size:1.1rem;">
                      <span>Total</span>
                      <span class="text-primary">${billing.totalMonthly}€/mois</span>
                  </div>
                  <button onclick="app.Pricing.showBillingDetails()" style="width:100%; padding:10px; background:var(--panel-bg); color:var(--text-main); border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:0.9rem;">
                      📊 Voir le détail
                  </button>
              </div>
          `;
      },
      
      // Afficher le détail de facturation
      showBillingDetails: async () => {
          const billing = await Pricing.calculateTotalMonthlyPrice();
          
          let detailsHtml = billing.details.map(p => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg); border-radius:8px; margin-bottom:8px;">
                  <div>
                      <strong>${Utils.escape(p.title)}</strong>
                      <div class="text-sec-sm2">${p.collaborators} collaborateur${p.collaborators > 1 ? 's' : ''} • ${p.detail}</div>
                  </div>
                  <div style="text-align:right; font-weight:bold;">
                      ${p.price}€/mois
                  </div>
              </div>
          `).join('');
          
          const modal = document.createElement('div');
          modal.id = 'billing-details-modal';
          modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index: var(--z-modal);display:flex;align-items:center;justify-content:center;padding:20px;';
          modal.innerHTML = `
              <div style="background:var(--panel-bg); border-radius:16px; padding:30px; max-width:500px; width:100%; max-height:80vh; overflow-y:auto;">
                  <div class="section-header-20">
                      <h2 class="m-0">📊 Détail de facturation</h2>
                      <button onclick="document.getElementById('billing-details-modal').remove()" class="icon-btn">✕</button>
                  </div>
                  
                  <div style="background:var(--bg); border-radius:8px; padding:15px; margin-bottom:20px; font-size:0.85rem; color:var(--text-sec);">
                      <strong>Tarification :</strong><br>
                      • 1-5 collaborateurs = 1€/mois<br>
                      • 6-15 collaborateurs = 2€/mois<br>
                      • +1€ par tranche de 10 au-delà
                  </div>
                  
                  <div class="mb-20">
                      ${detailsHtml}
                  </div>
                  
                  <div style="background:var(--primary); color:white; border-radius:12px; padding:20px; text-align:center;">
                      <div style="font-size:0.9rem; opacity:0.9;">Total mensuel</div>
                      <div style="font-size:2.5rem; font-weight:bold;">${billing.totalMonthly}€</div>
                  </div>
                  
                  <p style="text-align:center; margin-top:15px; font-size:0.8rem; color:var(--text-sec);">
                      💡 Un collaborateur = une fiche comédien ou technicien dans le projet.
                  </p>
              </div>
          `;
          document.body.appendChild(modal);
      }
  };
  
  // StoreMigrations — sous-module B.1.1 : migrations de schéma de données + helpers d'identité
  // Cohabite avec les anciennes méthodes de Store jusqu'à la bascule B.1.1.b