/**
 * CAPI Proxy — Ateliê Zoê
 * Vercel Serverless Function: /api/track
 *
 * Recebe eventos do browser e os reencaminha para a
 * Meta Conversions API (server-side), garantindo:
 *  - Eventos não bloqueados por ad blockers
 *  - Compatibilidade com iOS 14+ (opt-out de tracking)
 *  - IP e User-Agent reais do usuário (maior Event Match Quality)
 *  - Deduplicação via event_id (evita contagem dupla com o Pixel browser)
 *
 * Variáveis de ambiente necessárias no Vercel:
 *  CAPI_ACCESS_TOKEN  → token gerado em Meta Events Manager → seu Pixel → Configurações → API de Conversões
 *  PIXEL_ID           → 144321805290742 (já configurado, mas pode sobrescrever aqui)
 */

module.exports = async function handler(req, res) {
  /* CORS — permite chamadas da LP */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const PIXEL_ID   = process.env.PIXEL_ID          || '144321805290742';
  const CAPI_TOKEN = process.env.CAPI_ACCESS_TOKEN;

  /* Se ainda não tem o token configurado: retorna ok silencioso
     (não quebra a página, só não envia CAPI) */
  if (!CAPI_TOKEN) {
    return res.status(200).json({ ok: false, reason: 'CAPI_ACCESS_TOKEN não configurado no Vercel' });
  }

  try {
    const body = req.body;

    /* IP real do usuário (Vercel adiciona x-forwarded-for) */
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
               || req.socket?.remoteAddress
               || '';

    const ua = req.headers['user-agent'] || '';

    const payload = {
      data: [{
        event_name       : body.event_name,
        event_time       : Math.floor(Date.now() / 1000),
        event_id         : body.event_id,          /* deduplicação com o Pixel browser */
        event_source_url : body.event_source_url,
        action_source    : 'website',
        user_data: {
          client_ip_address : ip,
          client_user_agent : ua,
          fbp               : body.fbp  || undefined,  /* cookie _fbp do Meta */
          fbc               : body.fbc  || undefined,  /* cookie _fbc do Meta */
        },
        custom_data: body.custom_data || {}
      }],
      access_token: CAPI_TOKEN
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`,
      {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify(payload)
      }
    );

    const result = await metaRes.json();
    return res.status(200).json({ ok: true, result });

  } catch (err) {
    /* Falha silenciosa — nunca quebra a LP */
    return res.status(200).json({ ok: false, error: err.message });
  }
};
