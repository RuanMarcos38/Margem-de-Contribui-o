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

const esc=(value:string)=>value
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#039;");

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({ok:false,error:"Método não permitido."},405);

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
    const targetUser=String(body.user_id||"");
    if(!companyId||!targetUser) return json({ok:false,error:"Empresa e usuário são obrigatórios."},400);

    const {data:membership,error:membershipErr}=await userClient
      .from("memberships")
      .select("role")
      .eq("company_id",companyId)
      .eq("user_id",user.id)
      .maybeSingle();

    if(membershipErr) return json({ok:false,error:"Não foi possível validar sua permissão."},500);
    if(!membership||!["admin","super_admin"].includes(membership.role)){
      return json({ok:false,error:"Somente administrador pode enviar esta notificação."},403);
    }

    const [{data:targetMembership,error:targetMembershipErr},{data:profile,error:profileErr},{data:company,error:companyErr}]=await Promise.all([
      admin.from("memberships").select("role").eq("company_id",companyId).eq("user_id",targetUser).maybeSingle(),
      admin.from("profiles").select("full_name,approval_status,status").eq("id",targetUser).maybeSingle(),
      admin.from("companies").select("name").eq("id",companyId).maybeSingle()
    ]);

    if(targetMembershipErr||profileErr||companyErr) return json({ok:false,error:"Falha ao carregar dados para o e-mail."},500);
    if(!targetMembership) return json({ok:false,error:"Usuário não pertence a esta empresa."},403);
    if(profile?.approval_status!=="approved") return json({ok:false,error:"O usuário ainda não está aprovado."},409);

    const {data:userResult,error:targetErr}=await admin.auth.admin.getUserById(targetUser);
    if(targetErr||!userResult?.user?.email) return json({ok:false,error:"E-mail do usuário não encontrado."},404);

    const {data:cfg,error:cfgErr}=await admin.rpc("get_transactional_email_config");
    if(cfgErr) return json({ok:false,error:"Configuração de e-mail indisponível."},500);

    const apiKey=String(cfg?.resend_api_key||"");
    const from=String(cfg?.from_email||"");
    if(!apiKey||!from){
      return json({ok:false,error:"Serviço de e-mail transacional ainda não configurado."},503);
    }

    const recipient=userResult.user.email;
    const name=profile?.full_name||recipient;
    const companyName=company?.name||"Margem de Contribuição";
    const role=String(targetMembership.role||"visualizacao");

    const html=`<!doctype html>
<html lang="pt-BR">
<body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033">
  <div style="max-width:620px;margin:32px auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8edf5">
    <div style="background:#0f66e8;padding:28px 32px;color:#ffffff">
      <div style="font-size:14px;opacity:.9">Margem de Contribuição</div>
      <div style="font-size:24px;font-weight:700;margin-top:6px">Aprovação concluída com sucesso</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Olá, <strong>${esc(String(name))}</strong>.</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Seu acesso à empresa <strong>${esc(String(companyName))}</strong> foi aprovado com sucesso.</p>
      <div style="background:#f7f9fc;border:1px solid #e6ebf2;border-radius:10px;padding:18px;margin:22px 0">
        <div style="font-size:13px;color:#64748b">Perfil liberado</div>
        <div style="font-size:16px;font-weight:700;margin-top:4px">${esc(role)}</div>
      </div>
      <p style="font-size:16px;line-height:1.6;margin:0 0 24px">Você já pode acessar normalmente a plataforma.</p>
      <a href="https://custo.rrestrategiaperformance.com.br/" style="display:inline-block;background:#0f66e8;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">Acessar plataforma</a>
    </div>
  </div>
</body>
</html>`;

    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        from,
        to:[recipient],
        subject:"Aprovação concluída com sucesso",
        html
      })
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      return json({ok:false,error:data?.message||"Falha ao enviar e-mail de aprovação."},502);
    }

    await admin.from("audit_logs").insert({
      company_id:companyId,
      user_id:user.id,
      action:"approval_email_sent",
      entity_type:"profile",
      entity_id:targetUser,
      new_data:{email:recipient,provider:"resend",message_id:data?.id||null}
    });

    return json({ok:true,email:recipient,message_id:data?.id||null});
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:"Falha inesperada."},500);
  }
});