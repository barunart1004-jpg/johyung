// netlify/functions/send-email.js
// Node 18+ (Netlify) — fetch 내장
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // 클라에서 두 가지 이름 중 어떤 걸 보내도 수용
    const to        = body.to;
    const subject   = body.subject || '테스트 결과 안내';
    const html      = body.html || undefined;

    const fileName  = body.fileName || body.attachmentName || 'result.pdf';
    let   base64    = body.pdfBase64 || body.attachmentBase64 || '';

    // data URI가 들어오면 접두부 제거
    if (base64.includes(',')) base64 = base64.split(',')[1];

    if (!to || !base64) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ error: 'Missing fields: to, pdfBase64' })
      };
    }

    // 대략 크기 제한(15MB)
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > 15 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ error: 'Attachment too large (>15MB)' })
      };
    }

    const from = process.env.RESEND_FROM || 'result@barunart.com';
    const textLines = [
      `${body.childName || '학생'}의 미술적성 테스트 결과를 보내드립니다.`,
      body.campus ? `캠퍼스: ${body.campus}` : '',
      '',
      '첨부된 PDF 파일을 확인해 주세요.'
    ].filter(Boolean);
    const text = textLines.join('\n');

    // Resend API 호출
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to,                 // 배열/문자열 모두 허용
        subject,
        text,
        html,               // 있으면 HTML 본문도 전송
        attachments: [{
          filename: fileName,
          content: base64,
          contentType: 'application/pdf'
        }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: resp.status,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ error: errText })
      };
    }

    const data = await resp.json();
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      body: JSON.stringify({ id: data?.id || 'ok' })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      body: JSON.stringify({ error: e.message })
    };
  }
};
