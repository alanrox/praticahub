// src/index.js
//
// Worker principal do projeto (Workers + Static Assets). Esse projeto
// deploya com `wrangler deploy`, não com o pipeline de Cloudflare Pages
// — então a pasta /functions (roteamento de Pages Functions) nunca é
// lida. A rota POST /subscribe precisa ser tratada aqui, no Worker.
//
// Tudo que não for POST/OPTIONS /subscribe cai para os assets estáticos
// (binding ASSETS): index.html, /papinhas/, /kit/, /obrigado/, o PDF,
// e as regras do _redirects (que continuam funcionando normalmente,
// nativas em Workers Static Assets).
//
// CORREÇÃO (v2): o Resend descontinuou o modelo de "Audiences" com ID.
// Contatos agora são globais na conta — POST /contacts direto, sem
// precisar de nenhum ID de audiência. Agrupamento é feito por Segment
// (o segmento "Papinhas" já foi criado).
//
// Variável de ambiente esperada (Settings > Variables and Secrets do
// Worker "praticahub" no painel Cloudflare):
//   RESEND_API_KEY  -> obrigatória

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const SEGMENT_ID = "bea245d4-6845-44b1-883e-b05d54c6b551"; // segmento "Papinhas"

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || "");
}

function emailHtml(name) {
  const hello = name ? `Olá, ${name}!` : "Olá!";
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F6F0;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#F2F6F0">
<tr><td align="center" style="padding:32px 16px;">
  <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #D3E0CE;">

    <tr><td align="center" style="background:#22332A;border-radius:16px 16px 0 0;padding:22px 32px;">
      <p style="margin:0;font-size:11px;font-weight:400;letter-spacing:.22em;text-transform:uppercase;color:#93A498;">Guia prático de introdução alimentar</p>
      <p style="margin:8px 0 0;font-family:Georgia,serif;font-size:26px;font-weight:700;color:#F2F6F0;">Papinhas <em style="color:#EE8442;font-style:italic;">Fáceis</em></p>
    </td></tr>

    <tr><td style="padding:32px 36px 16px;">
      <p style="margin:0 0 16px;font-size:16px;color:#22332A;">${hello}</p>
      <p style="margin:0 0 16px;font-size:15px;color:#46594E;line-height:1.7;">
        Seu ebook chegou. São <strong style="color:#22332A;">22 páginas</strong> — uma receita por página,
        feitas para caber inteiras na tela do celular enquanto você cozinha com a outra mão.
      </p>
    </td></tr>

    <tr><td align="center" style="padding:8px 36px 32px;">
      <a href="https://praticahub.com.br/ebook" target="_blank"
         style="display:inline-block;background:#EE8442;color:#ffffff;text-decoration:none;
                font-weight:700;font-size:16px;padding:16px 36px;border-radius:60px;">
        📥 Baixar Papinhas Fáceis (PDF)
      </a>
      <p style="margin:14px 0 0;font-size:12px;color:#93A498;">
        Se o botão não abrir: <a href="https://praticahub.com.br/ebook" style="color:#EE8442;">praticahub.com.br/ebook</a>
      </p>
    </td></tr>

    <tr><td style="background:#F2F6F0;border-radius:0 0 16px 16px;padding:18px 36px;border-top:1px solid #D3E0CE;">
      <p style="margin:0;font-size:12px;color:#93A498;line-height:1.6;">
        Você recebeu este e-mail porque se cadastrou em
        <a href="https://praticahub.com.br/papinhas/" style="color:#5C9E55;">praticahub.com.br/papinhas</a>.
        Não quer mais receber? Responda este e-mail pedindo para sair da lista.
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
}

async function handleSubscribe(request, env) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let email = "";
    let name = "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      email = (body.email || "").toString().trim();
      name = (body.name || "").toString().trim();
    } else {
      const form = await request.formData();
      email = (form.get("email") || "").toString().trim();
      name = (form.get("name") || "").toString().trim();
    }

    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ ok: false, error: "email_invalido" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!env.RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "config_ausente" }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    // 1) Cria o contato (endpoint global, sem audience_id) e já
    //    coloca no segmento "Papinhas". Não bloqueia o fluxo se
    //    falhar (ex.: contato já existe) — o e-mail sai de qualquer forma.
    try {
      const [firstName, ...rest] = name.split(" ").filter(Boolean);
      await fetch("https://api.resend.com/contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          first_name: firstName || undefined,
          last_name: rest.length ? rest.join(" ") : undefined,
          unsubscribed: false,
        }),
      });

      await fetch("https://api.resend.com/contacts/add-to-segment", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, segment_id: SEGMENT_ID }),
      }).catch(() => {});
    } catch (_) {
      // segue o fluxo mesmo se o cadastro do contato falhar
    }

    // 2) Envia o e-mail de entrega do ebook
    const sendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Pratica Hub <contato@praticahub.com.br>",
        to: [email],
        subject: "Seu ebook Papinhas Fáceis chegou 🥕",
        html: emailHtml(name),
      }),
    });

    if (!sendResp.ok) {
      const detail = await sendResp.text();
      return new Response(
        JSON.stringify({ ok: false, error: "envio_falhou", detail }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "erro_servidor", detail: String(err) }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}

function handleSubscribeOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/subscribe") {
      if (request.method === "POST") return handleSubscribe(request, env);
      if (request.method === "OPTIONS") return handleSubscribeOptions();
    }

    return env.ASSETS.fetch(request);
  },
};
