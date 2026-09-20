-- ============================================================================
--  MOTEUR — ECRITURE D'UNE SEULE SCENE (v601)
-- ============================================================================
--  A APPLIQUER dans l'editeur SQL de Supabase. Sans cette fonction, rien ne
--  casse : le navigateur retombe tout seul sur l'ancienne ecriture (voir
--  StoreSave.saveScene, qui rattrape l'erreur « fonction inconnue »).
--
--  POURQUOI
--  --------
--  patch_project_data fusionne au PREMIER NIVEAU :
--        data = data || {"scenes": [ ...toutes les scenes... ]}
--  Envoyer une seule scene modifiee obligeait donc a renvoyer le TABLEAU
--  ENTIER. Deux personnes qui ecrivent chacune sa scene s'ecrasent l'une
--  l'autre, et la derniere gagne. C'est exactement ce que le verrou par
--  DOMAINE empeche aujourd'hui, au prix de bloquer le Scenario, le Sequencier
--  et le Depouillement des qu'une personne ecrit.
--
--  Descendre le verrou a la scene SANS descendre l'ecriture ne ferait donc pas
--  gagner de securite : il en ferait perdre. Cette fonction est le prealable.
--
--  CE QU'ELLE FAIT
--  ---------------
--  Elle remplace UNE entree du tableau 'scenes', reperee par son id, sans
--  toucher aux autres. Si l'id n'existe pas encore, elle ajoute la scene a la
--  fin — un ajout concurrent ne peut donc pas en perdre un autre.
--
--  MEMES GARDES QUE patch_project_data : SECURITY DEFINER, search_path fixe,
--  et le meme controle de droit d'ecriture. Elle ne donne aucun acces nouveau.
-- ============================================================================

create or replace function public.patch_project_scene(p_id uuid, p_scene jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_idx int;
begin
  if not can_edit_project(p_id) then
    raise exception 'forbidden: not an editor of this project';
  end if;

  if p_scene is null or coalesce(p_scene->>'id', '') = '' then
    raise exception 'patch_project_scene: scene sans id';
  end if;

  -- Position de la scene dans le tableau. WITH ORDINALITY compte a partir de 1,
  -- jsonb_set indexe a partir de 0 : d'ou le -1.
  select t.i - 1
    into v_idx
    from public.projects pr,
         lateral jsonb_array_elements(coalesce(pr.data->'scenes', '[]'::jsonb))
                 with ordinality as t(el, i)
   where pr.id = p_id
     and t.el->>'id' = p_scene->>'id'
   limit 1;

  if v_idx is null then
    -- Scene inconnue : on l'AJOUTE plutot que d'echouer. Deux personnes qui
    -- creent une scene en meme temps en gardent donc chacune une.
    update public.projects
       set data = jsonb_set(
                    coalesce(data::jsonb, '{}'::jsonb),
                    '{scenes}',
                    coalesce(data->'scenes', '[]'::jsonb) || jsonb_build_array(p_scene),
                    true),
           updated_at = now()
     where id = p_id;
  else
    update public.projects
       set data = jsonb_set(data::jsonb, array['scenes', v_idx::text], p_scene, true),
           updated_at = now()
     where id = p_id;
  end if;
end;
$function$;

-- Les appels viennent du navigateur, comme pour patch_project_data.
grant execute on function public.patch_project_scene(uuid, jsonb) to authenticated;
