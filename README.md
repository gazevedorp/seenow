# SEENOW

Estúdio para lojas de piso e revestimento simularem a troca do material na foto real do ambiente. O caminho premium compõe a **textura do catálogo** dentro da máscara, com perspectiva e a luz da foto. Fora da máscara, os pixels originais permanecem.

## Pipeline

1. **Segmentação.** Com `HF_TOKEN`, o servidor do Vite chama o SegFormer ADE20K `nvidia/segformer-b5-finetuned-ade-640-640` (classes parede `0`, piso `3`, teto `5`). Se o B5 não responder, tenta `nvidia/segformer-b2-finetuned-ade-512-512`. Sem token da Hugging Face e com `REPLICATE_API_TOKEN`, o mesmo modelo roda como `simbrams/segformer-b5-finetuned-ade-640-640`. Esse id é um modelo da comunidade: o servidor busca a versão mais recente e cria a previsão em `POST /v1/predictions` com `owner/nome:<id>`. Para travar a versão, use `owner/nome:<id de 64 caracteres>`. O Flux Fill oficial segue como `owner/nome`. A máscara passa por um fechamento de 1 px para limpar a borda; móveis continuam de fora. O Grounded SAM (`schananas/grounded_sam`) só entra se a máscara do SegFormer for implausível e houver token do Replicate.
2. **Material.** A textura do SKU (`textureUrl`, `tileScale`) é projetada na região com homografia e reiluminada pela luminância da foto (multiply + soft-light). Esse passo é `perspective-warp-v1` e não depende de prompt generativo.
3. **Polimento.** Com `FAL_KEY`, o Flux Fill `fal-ai/flux-pro/v1/fill` repinta só a faixa de emenda da máscara. Sem a Fal e com Replicate, usa `black-forest-labs/flux-fill-pro`. O interior da textura composta não é redesenhado. `OPENAI_API_KEY` não segmenta e não aplica o material.
4. **Profundidade.** Com `HF_TOKEN`, o Depth Anything V2 pode ajustar o encolhimento do piso. Se falhar, a homografia segue sozinha.

Sem chave, a tela usa o recorte `geometric-trapezoid-v1` e avisa que não é SegFormer. A textura do catálogo ainda é aplicada. Não há fallback para heurística de cor (`room-color-region-v1`) nem para `gpt-image`.

As chaves ficam no processo do Vite (`apps/web/.env.local`, sem prefixo `VITE_`). O bundle do browser não as recebe.

## Rodar localmente

Requisitos: Node 22+ e pnpm 10.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm --filter web dev
```

O Vite sobe em [http://127.0.0.1:4317](http://127.0.0.1:4317). As rotas `/api/pipeline-status`, `/api/segment`, `/api/segment-sam` e `/api/polish` existem nesse servidor. Reinicie o `dev` depois de mudar o `.env.local`.

Equivalente, a partir da raiz:

```bash
pnpm dev
```

Checagens:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Variáveis de ambiente

| Variável | Padrão | Uso |
| --- | --- | --- |
| `HF_TOKEN` | vazio | SegFormer B5 (fallback B2) e Depth Anything V2 |
| `REPLICATE_API_TOKEN` | vazio | SegFormer, Grounded SAM e Flux Fill se não houver Fal |
| `FAL_KEY` | vazio | Flux Fill `fal-ai/flux-pro/v1/fill` |
| `OPENAI_API_KEY` | vazio | Ignorada neste fluxo |
| `SEGMENTATION_PROVIDER` | `auto` | `auto`, `huggingface`, `replicate` ou `off` |
| `POLISH_PROVIDER` | `auto` | `auto`, `fal`, `replicate` ou `off` |
| `DEPTH_PROVIDER` | `auto` | `auto` ou `off` |
| `VITE_SUPABASE_URL` | vazio | Só é detectada na tela de entrada. Auth real fica para a fase 2 |
| `VITE_SUPABASE_ANON_KEY` | vazio | Idem. Nunca coloque `service_role` no front |

Modelos e overrides estão em `apps/web/.env.example`.

## Validar o fluxo

1. Abra o app e clique em **Entrar na demonstração**.
2. Em Simulações, clique em **Abrir demonstração**. Isso cria a cliente Marina Costa, o ambiente Sala de estar e uma foto de exemplo.
3. A detecção marca piso e parede. A barra lateral mostra o provedor e o id do modelo de verdade.
4. Escolha um SKU. Piso ou parede acompanha a superfície do produto.
5. **Ver prévia**. O antes/depois compara a foto com a textura aplicada. **Máscara de depuração** liga o overlay.
6. A versão fica no histórico do projeto, neste navegador (IndexedDB).

Para uma foto sua: **Nova simulação**, cadastre o cliente e envie JPEG, PNG ou WEBP de até 10 MB. O lado maior é limitado a 2048 px.

Os dados da simulação não vão para um servidor seu. As chamadas de SegFormer, Depth Anything e Flux Fill saem do processo do Vite quando as chaves existem. Limpar os dados do site no navegador apaga clientes, fotos e versões.

## Catálogo

Nove texturas contínuas em `apps/web/public/textures`: laminado carvalho claro e escuro, vinílico madeira e pedra, porcelanato cinza mate e mármore, carpete cinza, cerâmica hexagonal e subway. Para regerar:

```bash
node --experimental-strip-types apps/web/scripts/generate-textures.ts
```

## Estrutura

```
apps/web                 Vite + React. O plugin em vite-plugin-pipeline.ts expõe /api
apps/web/server          SegFormer, Flux Fill e Depth Anything
apps/web/src/lib/material  homografia, tile e relight
packages/shared          tipos, catálogo, máscara e resolução de provedor
supabase/                stub da fase 2
```

## Fase 2

Ainda não entra nesta entrega:

- painel admin, organizações, usuários e papéis
- API NestJS e o worker com better-sqlite3
- migrations Supabase, RLS e Auth
- deploy (front na Vercel, API na VPS)
