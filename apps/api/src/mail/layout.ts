// Plantillas de mail: HTML con estilos en línea (los clientes de correo ignoran las hojas
// de estilo) y una versión en texto plano para quien no ve HTML.

const BRAND = '#5B4CF5';
const INK = '#16142B';
const MUTED = '#4A4860';

/** Escapa lo que viene de afuera (nombres, motivos) antes de meterlo en el HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface MailContent {
  /** Título grande del mail. */
  title: string;
  /** Párrafos de texto. Se escapan. */
  paragraphs: string[];
  /** Detalle en forma de lista: "Servicio: Corte". Se escapa. */
  details?: [label: string, value: string][];
  /** Botón principal. */
  action?: { label: string; url: string };
  /** Nota chica al pie. */
  footnote?: string;
}

/** Arma el HTML y el texto plano de un mail con el diseño de Booklet. */
export function renderMail(c: MailContent): { html: string; text: string } {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${INK}">${escapeHtml(text)}</p>`;
  const details = c.details?.length
    ? `<table role="presentation" style="margin:0 0 24px;border-collapse:collapse;font-size:15px">${c.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:${MUTED}">${escapeHtml(label)}</td><td style="padding:4px 0;color:${INK};font-weight:600">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const action = c.action
    ? `<p style="margin:0 0 24px"><a href="${escapeHtml(c.action.url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(c.action.label)}</a></p>`
    : '';
  const footnote = c.footnote
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(c.footnote)}</p>`
    : '';

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#F6F6FA;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${INK}">b<span style="color:${BRAND}">oo</span>klet</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${escapeHtml(c.title)}</h1>
${c.paragraphs.map(p).join('\n')}
${details}
${action}
${footnote}
</div>
<p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;color:${MUTED}">Booklet · Tu agenda, siempre al día.</p>
</body></html>`;

  const text = [
    c.title,
    '',
    ...c.paragraphs.flatMap((t) => [t, '']),
    ...(c.details ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(c.details?.length ? [''] : []),
    ...(c.action ? [`${c.action.label}: ${c.action.url}`, ''] : []),
    ...(c.footnote ? [c.footnote, ''] : []),
    '—',
    'Booklet · Tu agenda, siempre al día.',
  ].join('\n');

  return { html, text };
}
