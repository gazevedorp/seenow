# SEENOW

Estúdio para lojas de piso, tinta e arquitetos simularem uma troca de piso ou parede na foto real do ambiente. Esta entrega é a **fase 1**: o fluxo de quem opera a simulação, com `pnpm --filter web dev`.

Depois da foto e da escolha **Piso** ou **Parede**, a região é marcada sozinha. O pincel só serve de ajuste fino. A geração — local ou de um provedor — altera **somente** os pixels dentro dessa região. Fora dela, a foto permanece a original.

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

Nenhuma é obrigatória. Sem chave, a região sai de uma estimativa pelas cores da foto e a geração usa o composto local (`mock`).

Copie o exemplo para o app web (o Vite lê este diretório, não a raiz):

```bash
cp apps/web/.env.example apps/web/.env.local
```

Segredos ficam só no servidor do Vite (`pnpm --filter web dev` e `vite preview`). **Não** use prefixo `VITE_` neles — isso iria para o bundle do browser.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `REPLICATE_API_TOKEN` | vazio | Segmentação e, se o inpainting estiver em `auto`, também a geração |
| `OPENAI_API_KEY` | vazio | Inpainting quando não há token Replicate. Segmentação só se `SEGMENTATION_PROVIDER=openai` |
| `SEGMENTATION_PROVIDER` | `auto` | `auto`, `replicate`, `openai` ou `heuristic`. `auto` usa Replicate se houver token; senão, a estimativa local |
| `REPLICATE_SEGMENT_MODEL` | `simbrams/segformer-b5-finetuned-ade-640-640` | ADE20K (classes `floor` e `wall`). Para Segment Anything por texto, use `schananas/grounded_sam` |
| `INPAINTING_PROVIDER` | `auto` | `auto`, `mock`, `replicate` ou `openai`. `auto`: Replicate, senão OpenAI, senão simulação local |
| `REPLICATE_INPAINT_MODEL` | `black-forest-labs/flux-fill-pro` | Branco na máscara = área editada. O app ainda cola o resultado só dentro da região |
| `OPENAI_INPAINT_MODEL` | `gpt-image-1.5` | `POST /v1/images/edits`. Transparente na máscara = área editada |
| `OPENAI_SEGMENT_MODEL` | `gpt-4.1-mini` | Contorno em polígono, usado só com `SEGMENTATION_PROVIDER=openai` |
| `OPENAI_IMAGE_QUALITY` | `low` | `low`, `medium` ou `high`. Estimativa de custo na resposta |
| `VITE_INPAINTING_PROVIDER` | `auto` | `auto`, `mock`, `openai` ou `replicate`. `mock` força a simulação local |
| `VITE_API_URL` | vazio | API Nest da fase 2. Se preenchida com `openai` ou `replicate`, o browser chama essa API em vez das rotas locais |
| `VITE_SUPABASE_URL` | vazio | Só é detectada na tela de entrada. Auth real fica para a fase 2 |
| `VITE_SUPABASE_ANON_KEY` | vazio | Idem. Nunca coloque `service_role` no front, nem com prefixo `VITE_` |

Rotas locais (mesmo origem, sem CORS): `GET /api/ai-status`, `POST /api/segment`, `POST /api/inpaint`. A segmentação tenta de novo 1 vez; o inpainting, até 3, com pausa de 1s e 2s. Cada tentativa tem limite de 45s. Falha de provedor não trava o fluxo: a região volta para a estimativa da foto e a geração volta para o composto local, exceto quando `VITE_INPAINTING_PROVIDER` foi fixado em `openai` ou `replicate`.

## Validar o fluxo

1. Abra o app e clique em **Entrar na demonstração** (ou use qualquer e-mail válido e uma senha com 4+ caracteres).
2. Em Simulações, clique em **Abrir demonstração**. Isso cria a cliente Marina Costa, o ambiente Sala de estar e uma foto de exemplo.
3. Escolha **Piso** ou **Parede**. A região é marcada na hora.
4. Confira o contorno. Se precisar, abra **Ajuste fino** e use pincel ou borracha. Sem edição, a região automática já vale.
5. Escolha um produto do catálogo (8 itens: pisos, porcelanatos, revestimento e tintas).
6. **Gerar simulação**. Sem chave, o modo local devolve o antes/depois em seguida e não pinta fora da região.
7. Arraste o controle para comparar. A versão fica no histórico do projeto, neste navegador (IndexedDB).

Para uma foto sua: **Nova simulação**, cadastre o cliente (nome obrigatório; e-mail, telefone e documento opcionais) e envie JPEG, PNG ou WEBP de até 10 MB. O lado maior é limitado a 2048 px, sem mudar a proporção.

Os dados não vão para um servidor. Limpar os dados do site no navegador apaga clientes, fotos e versões.

## Estrutura

```
apps/web            Vite + React + TypeScript + Tailwind + shadcn
packages/shared     tipos do domínio e contrato do InpaintingAdapter
supabase/           stub da fase 2 (migrations, RLS, storage)
```

O adapter está em `apps/web/src/lib/inpainting/`. Sem chave, `MockInpaintingAdapter` compõe a textura. Com `REPLICATE_API_TOKEN` ou `OPENAI_API_KEY`, `LocalApiInpaintingAdapter` chama o servidor do Vite e, na volta, recoloca os pixels de fora da região com os da foto. `RemoteInpaintingAdapter` só entra com `VITE_API_URL` e provedor `openai` ou `replicate`.

A segmentação fica em `apps/web/src/lib/segmentation/` (estimativa pela foto) e `apps/web/server/` (Replicate ADE20K ou Grounded SAM, e o contorno OpenAI).

## Fase 2

Ainda não entra nesta entrega:

- painel admin, organizações, usuários e papéis (`SUPER_ADMIN`, `ORGANIZATION_ADMIN`, `ARCHITECT`)
- relatórios de uso, cota e auditoria
- API NestJS na VPS Hostinger (`apps/api`)
- migrations Supabase em `sa-east-1`, RLS por `organization_id`, bucket privado e Auth e-mail/senha
- API NestJS com a mesma ideia de adapter (a fase 1 já fala com Replicate e OpenAI pelo servidor do Vite)
- spike cego de qualidade antes de travar o modelo de inpainting (`gpt-image` × `flux-fill-pro`)
- deploy (front na Vercel, API na VPS). Não há ambiente de produção nesta fase
