# SEENOW

Estúdio para lojas de piso, tinta e arquitetos simularem uma troca de piso ou parede na foto real do ambiente. Esta entrega é a **fase 1**: o fluxo de quem opera a simulação, rodando só no navegador, sem chave de API.

A geração local compõe a textura do produto **somente dentro da máscara**. Fora dela, os pixels da foto permanecem os originais.

## Rodar localmente

Requisitos: Node 22+ e pnpm 10.

```bash
pnpm install
pnpm --filter web dev
```

O Vite sobe em [http://127.0.0.1:4317](http://127.0.0.1:4317).

Equivalente, a partir da raiz:

```bash
pnpm dev
```

Checagens:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Variáveis de ambiente

Todas são opcionais. Sem nenhuma delas o app entra em modo demonstração e gera com o provedor `mock`.

Copie o exemplo para o app web (o Vite lê este diretório, não a raiz):

```bash
cp apps/web/.env.example apps/web/.env.local
```

| Variável | Padrão | Uso |
| --- | --- | --- |
| `VITE_INPAINTING_PROVIDER` | `mock` | `mock`, `openai` ou `replicate` |
| `VITE_API_URL` | vazio | API Nest da fase 2. Sem ela, `openai` e `replicate` caem no mock e a tela avisa |
| `VITE_SUPABASE_URL` | vazio | Só é detectada na tela de entrada. Auth real fica para a fase 2 |
| `VITE_SUPABASE_ANON_KEY` | vazio | Idem. Nunca coloque `service_role` no front, nem com prefixo `VITE_` |

Não há segredo obrigatório. A chave de OpenAI ou Replicate não entra no browser: quando o provedor real existir, ele roda na API.

## Validar o fluxo

1. Abra o app e clique em **Entrar na demonstração** (ou use qualquer e-mail válido e uma senha com 4+ caracteres).
2. Em Simulações, clique em **Abrir demonstração**. Isso cria a cliente Marina Costa, o ambiente Sala de estar e uma foto de exemplo.
3. Escolha **Piso** ou **Parede**.
4. Escolha um produto do catálogo (8 itens: pisos, porcelanatos, revestimento e tintas).
5. Na máscara, ajuste com pincel e borracha se quiser. **Confirmar máscara** é obrigatório.
6. **Gerar simulação**. O modo mock devolve o antes/depois em seguida.
7. Arraste o controle para comparar. A versão fica no histórico do projeto, neste navegador (IndexedDB).

Para uma foto sua: **Nova simulação**, cadastre o cliente (nome obrigatório; e-mail, telefone e documento opcionais) e envie JPEG, PNG ou WEBP de até 10 MB. O lado maior é limitado a 2048 px, sem mudar a proporção.

Os dados não vão para um servidor. Limpar os dados do site no navegador apaga clientes, fotos e versões.

## Estrutura

```
apps/web            Vite + React + TypeScript + Tailwind + shadcn
packages/shared     tipos do domínio e contrato do InpaintingAdapter
supabase/           stub da fase 2 (migrations, RLS, storage)
```

O adapter está em `apps/web/src/lib/inpainting/`. `MockInpaintingAdapter` é o padrão. `RemoteInpaintingAdapter` só é usado com `VITE_API_URL` e provedor `openai` ou `replicate`.

## Fase 2

Ainda não entra nesta entrega:

- painel admin, organizações, usuários e papéis (`SUPER_ADMIN`, `ORGANIZATION_ADMIN`, `ARCHITECT`)
- relatórios de uso, cota e auditoria
- API NestJS na VPS Hostinger (`apps/api`)
- migrations Supabase em `sa-east-1`, RLS por `organization_id`, bucket privado e Auth e-mail/senha
- segmentação OpenAI e inpainting real (spike `gpt-image` com máscara × Replicate `flux-fill-pro`), com retry e composição no servidor
- deploy (front na Vercel, API na VPS). Não há ambiente de produção nesta fase
