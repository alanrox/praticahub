# praticahub

Site praticahub.com.br — Cloudflare Worker com Static Assets (`wrangler.jsonc`).
O deploy é feito pelo Workers Builds a cada push na `main` (ou manualmente com `npx wrangler deploy`).

## Páginas

| Caminho | Arquivo | O que é |
|---|---|---|
| `/` | `index.html` | Home |
| `/papinhas/` | `papinhas/index.html` | Captura de e-mail do ebook Papinhas Fáceis |
| `/obrigado/` | `obrigado/index.html` | Pós-cadastro do Papinhas |
| `/kit/` | `kit/index.html` | Kit bebê (links de afiliado Shopee) |
| `/oquecomprar/` | `oquecomprar/index.html` | Página de vendas do guia O Que Comprar Primeiro |

## Rotas

- `POST /subscribe` — tratado em `src/index.js` (cadastro no Resend + envio do ebook). Requer o secret `RESEND_API_KEY`.
- Redirecionamentos (afiliados, checkout, downloads) ficam em `_redirects`. Sempre 302.
