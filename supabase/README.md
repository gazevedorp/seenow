# Supabase — fase 2

Nada aqui é aplicado nesta fase. O estúdio da fase 1 grava clientes, fotos e versões no IndexedDB do navegador.

Quando o banco entrar, a ordem prevista é:

1. Projeto Supabase em `sa-east-1`.
2. Migrations versionadas nesta pasta, com as correções da revisão de 29/09 (`current_user_role()`, RLS em tabelas globais, `byte_size`, categorias com `organization_id` nulo).
3. RLS por `organization_id` nas tabelas de negócio.
4. Bucket privado `seenow`, com policies no prefixo `organizations/{org}/` e URLs assinadas de vida curta.
5. Auth por e-mail e senha, sem cadastro público e sem convite por e-mail na UI.
6. A `service_role` fica só na API. O front recebe apenas a anon key, como `VITE_SUPABASE_ANON_KEY`.

Fotos de ambiente são dado pessoal em potencial. O pipeline de IA não deve receber nome, telefone ou documento do cliente — só a imagem e os atributos do produto.
