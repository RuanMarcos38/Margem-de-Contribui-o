-- Infraestrutura segura para e-mails transacionais de aprovação.
-- A chave do provedor deve ser armazenada no Supabase Vault, nunca no frontend ou GitHub.

create or replace function public.get_transactional_email_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'resend_api_key',
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='resend_api_key' order by created_at desc limit 1),''),
    'from_email',
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='approval_email_from' order by created_at desc limit 1),'')
  );
$$;

revoke all on function public.get_transactional_email_config() from public, anon, authenticated;
grant execute on function public.get_transactional_email_config() to service_role;

-- Depois de conectar/configurar o provedor, grave os valores no Vault:
-- select vault.create_secret('<RESEND_API_KEY>', 'resend_api_key');
-- select vault.create_secret('Margem <acesso@seu-dominio.com.br>', 'approval_email_from');
