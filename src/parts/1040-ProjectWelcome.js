
  const ProjectWelcome = {
      KEY: 'moteur_project_welcome_done',

      maybeShow: () => {
          try { if(localStorage.getItem(ProjectWelcome.KEY) === '1') return; } catch(e) {}
          ProjectWelcome.show();
      },

      show: () => {
          if(document.getElementById('pwelcome-overlay')) return;
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.id = 'pwelcome-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:600px;padding:0;text-align:left;overflow:hidden;">
              <div style="padding:22px 24px 16px;background:linear-gradient(135deg,var(--primary),#8b5cf6);color:#fff;">
                  <div style="font-size:1.25rem;font-weight:800;margin-bottom:6px;">🎬 Bienvenue dans ton projet !</div>
                  <div style="font-size:0.9rem;opacity:0.95;">Bonne chance — et surtout, bon courage ! Voici trois choses utiles avant de te lancer.</div>
              </div>
              <div style="padding:18px 24px;max-height:56vh;overflow-y:auto;font-size:0.9rem;line-height:1.5;">
                  <div style="margin-bottom:16px;">
                      <div style="font-weight:700;margin-bottom:4px;">🧭 Où trouver de l'aide</div>
                      <div style="color:var(--text-sec);">Chaque onglet a sa petite visite guidée. Ouvre le menu <strong>Fichier ▾</strong> puis <strong>« Visite guidée »</strong> : tu peux lancer la visite de l'onglet où tu te trouves, ou choisir un chapitre dans la liste.</div>
                  </div>
                  <div style="margin-bottom:16px;">
                      <div style="font-weight:700;margin-bottom:4px;">🎯 Garde seulement ce qui te sert</div>
                      <div style="color:var(--text-sec);">Moteur fait beaucoup de choses, de l'écriture jusqu'au tournage. Selon ton profil, tout ne te sera pas utile — et ce n'est pas grave. Tu peux <strong>masquer un onglet</strong> avec la petite croix <strong>×</strong> sur son titre, pour ne garder sous les yeux que l'essentiel et rester concentré·e. Un bouton dans la barre des catégories permet de <strong>tout réafficher</strong> quand tu veux.</div>
                  </div>
                  <div style="margin-bottom:6px;">
                      <div style="font-weight:700;margin-bottom:6px;">✍️ La bonne méthode pour écrire</div>
                      <div style="color:var(--text-sec);margin-bottom:10px;">Avant d'écrire tout le scénario, mieux vaut valider ton idée par étapes. À chaque marche, on vérifie que l'histoire tient debout avant de passer à la suivante :</div>
                      <div style="display:flex;flex-direction:column;gap:8px;">
                          <div style="display:flex;gap:10px;align-items:flex-start;"><span style="flex:0 0 24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">1</span><div><strong>L'idée</strong> — une ou deux phrases, le point de départ.</div></div>
                          <div style="display:flex;gap:10px;align-items:flex-start;"><span style="flex:0 0 24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">2</span><div><strong>Le résumé court</strong> — quelques lignes qui racontent l'histoire en entier.</div></div>
                          <div style="display:flex;gap:10px;align-items:flex-start;"><span style="flex:0 0 24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">3</span><div><strong>Le résumé long</strong> — le déroulé complet, scène après scène.</div></div>
                          <div style="display:flex;gap:10px;align-items:flex-start;"><span style="flex:0 0 24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">4</span><div><strong>Le scénario</strong> — enfin l'écriture, dialogues compris.</div></div>
                      </div>
                      <div style="color:var(--text-sec);margin-top:10px;">Les trois premières étapes se remplissent dans l'onglet <strong>Synopsis</strong>, la dernière dans l'onglet <strong>Scénario</strong>. C'est une bonne façon d'être sûr·e que l'idée est bonne avant d'y passer des heures.</div>
                  </div>
                  <div style="margin-top:16px;">
                      <div style="font-weight:700;margin-bottom:4px;">🔗 Fais-toi relire</div>
                      <div style="color:var(--text-sec);">Une fois ton scénario écrit, tu peux le <strong>partager en lecture seule</strong> à une personne extérieure, même sans compte Moteur : elle le lit et te laisse des retours, qui te reviennent directement dans l'app. Le partage se lance depuis les <strong>options d'export du scénario</strong>.</div>
                  </div>
              </div>
              <div style="padding:12px 24px 18px;border-top:1px solid var(--border);">
                  <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-sec);cursor:pointer;margin-bottom:12px;">
                      <input type="checkbox" id="pwelcome-dismiss" checked style="margin:0;cursor:pointer;">
                      Ne plus afficher ce message
                  </label>
                  <button type="button" id="pwelcome-ok" class="confirm-modal-btn confirm" style="width:100%;margin:0;">C'est parti !</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          const close = () => {
              try {
                  const dismiss = overlay.querySelector('#pwelcome-dismiss');
                  const on = !!(dismiss && dismiss.checked);
                  if(typeof PreferencesSync !== 'undefined') PreferencesSync.save(ProjectWelcome.KEY, on ? '1' : '0');
                  else localStorage.setItem(ProjectWelcome.KEY, on ? '1' : '0');
              } catch(e) {}
              overlay.remove();
          };
          const okBtn = overlay.querySelector('#pwelcome-ok');
          if(okBtn) okBtn.onclick = close;
          overlay.onclick = (e) => { if(e.target === overlay) close(); };
      },
  };

  return { Store, StoreMigrations, StoreUpdates, StoreRealtime, StoreSave, UI, UIPrint, UIHidden, UICategories, UIDashboard, UITheme, UIData, Actions, ActionsExport, Breakdown, BreakdownExport, ScriptEditor, ScriptEditorPrefs, ScriptEditorViewMode, ScriptEditorEpisodes, ScriptEditorSearch, ScriptEditorAC, ScriptEditorNav, ScriptEditorToolbar, ScriptEditorContinuous, ScriptImport, ScriptExport, Auth, Stats, Exporter, Importer, MoodBoard, MoodBoardExport, Storyboard, StoryboardExport, DrawingEditor, Crew, CrewExport, Planning, PlanningExport, PlanningFDS, PlanningCallSheets, PlanningAvailability, PlanningDragResize, PersonIdentity, PlanningTransport, FDSLive, PlanningBreakdown, PlanningDayEdit, PlanningBoards, PlanningCalendarViews, PlanningAvailPicker, Contacts, ActorSearch, PublicProfile, ProfileSkills, ProfileGear, ProfileAddress, ProfileClaims, GlobalSearch, Permissions, Messages, Invitations, Universe, UniverseFan, UniverseSearch, UniverseProfileModal, UniverseMap, Expenses, ExpensesExport, ExpensesSalaries, ExpensesBudget, ExpensesCRUD, Utils, Presentation, PresentMode, History, Notifications, Contracts, StoryboardPreview, Comments, Courses, CardModal, Synopsis, TitlePage, SceneVersions, MatchingEngine, CastingMatch, SessionManager, Pricing, Resources, ScriptReport, Weather, ColorWheel, BeatBoard, FocusMode, Forum, Editor, Icons, Admin, AdminEmail, Tour, Feedback, Tutorial, CoursesWeb, Landing, Terms, Router, PreferencesSync, ConfirmModal, LoadingScreen, ProfileRenderer, ActiveProfile, Moderation, Episodes, Seasons, PdfTheme, FichesPDF, Orgs, ProjectFolders, Figuration, CastFamilies, CrewDepartements, EquipeB, MiseAJour, GroupDnD, Geo, DBPresence, LockManager, LockDomains, VerrouFin, SceneLock, SceneNews, SynopsisLock, FicheLock, Links, Web, FicheLinks, RenameReview, Diag, FicheUI, FicheBlocks, Board, ScriptShare, ScriptReader, ScriptReview, ProjectWelcome, PhotoViewer };
})();
