import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2";

const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, x-client-info, apikey, content-type"
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...cors,"content-type":"application/json"}
});

async function findUserByEmail(admin:any,email:string){
  const target=email.trim().toLowerCase();
  for(let page=1;page<=20;page++){
    const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
    if(error) throw error;
    const found=(data?.users||[]).find((u:any)=>(u.email||"").trim().toLowerCase()===target);
    if(found) return found;
    if((data?.users||[]).length<1000) break;
  }
  return null;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});

  try{
    const auth=req.headers.get("Authorization")||"";
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const admin=createClient(url,service);

    const {data:{user},error:userErr}=await userClient.auth.getUser();
    if(userErr||!user) return json({ok:false,error:"Não autenticado."},401);

    const body=await req.json();
    const companyId=String(body.company_id||"");
    const email=String(body.email||"").trim().toLowerCase();
    const role=String(body.role||"visualizacao");

    if(!companyId||!email.includes("@")){
      return json({ok:false,error:"Empresa e e-mail são obrigatórios."},400);
    }

    const allowed=["admin","contador","financeiro","comercial","visualizacao"];
    if(!allowed.includes(role)){
      return json({ok:false,error:"Perfil inválido."},400);
    }

    const {data:membership,error:membershipErr}=await userClient
      .from("memberships")
      .select("role")
      .eq("company_id",companyId)
      .eq("user_id",user.id)
      .maybeSingle();

    if(membershipErr){
      return json({ok:false,error:"Não foi possível validar sua permissão."},500);
    }

    if(!membership||!["admin","super_admin"].includes(membership.role)){
      return json({ok:false,error:"Somente administrador pode convidar usuários."},403);
    }

    let targetUser=await findUserByEmail(admin,email);
    let invited=false;

    if(!targetUser){
      const {data:invite,error:inviteErr}=await admin.auth.admin.inviteUserByEmail(email,{
        redirectTo:"https://custo.rrestrategiaperformance.com.br/"
      });

      if(inviteErr) return json({ok:false,error:inviteErr.message},400);
      targetUser=invite.user;
      invited=true;
    }

    const userId=targetUser?.id;
    if(!userId){
      return json({ok:false,error:"Não foi possível identificar o usuário."},500);
    }

    const {data:existing,error:existingErr}=await admin
      .from("memberships")
      .select("id,role")
      .eq("company_id",companyId)
      .eq("user_id",userId)
      .maybeSingle();

    if(existingErr) return json({ok:false,error:existingErr.message},500);

    if(existing){
      if(existing.role!==role){
        const {error:updateErr}=await admin
          .from("memberships")
          .update({role})
          .eq("id",existing.id);
        if(updateErr) return json({ok:false,error:updateErr.message},500);
      }
    }else{
      const {error:insertErr}=await admin
        .from("memberships")
        .insert({company_id:companyId,user_id:userId,role});
      if(insertErr) return json({ok:false,error:insertErr.message},500);
    }

    return json({
      ok:true,
      user_id:userId,
      email,
      role,
      existing_user:!invited,
      message:invited
        ?"Convite enviado. O usuário ainda precisará da aprovação do Administrador Master para acessar."
        :"Usuário já cadastrado. Ele foi vinculado à empresa e ainda precisará da aprovação do Administrador Master para acessar."
    });
  }catch(error){
    return json({
      ok:false,
      error:error instanceof Error?error.message:"Falha inesperada."
    },500);
  }
});
