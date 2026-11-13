import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMail } from './layout.js';

describe('renderMail', () => {
  const mail = renderMail({
    title: 'Tu turno quedó reservado',
    paragraphs: ['Hola, <b>Juana</b> & familia.'],
    details: [['Servicio', 'Corte']],
    action: { label: 'Ver mi turno', url: 'https://booklet.app/turno/abc?x=1&y=2' },
    footnote: 'Si no reservaste, ignorá este mail.',
  });

  it('escapa lo que viene de afuera para que no se pueda inyectar HTML', () => {
    expect(mail.html).toContain('Hola, &lt;b&gt;Juana&lt;/b&gt; &amp; familia.');
    expect(mail.html).not.toContain('<b>Juana</b>');
    expect(mail.html).toContain('href="https://booklet.app/turno/abc?x=1&amp;y=2"');
  });

  it('arma una versión en texto plano con el link completo', () => {
    expect(mail.text).toContain('Hola, <b>Juana</b> & familia.');
    expect(mail.text).toContain('Servicio: Corte');
    expect(mail.text).toContain('Ver mi turno: https://booklet.app/turno/abc?x=1&y=2');
  });
});

describe('escapeHtml', () => {
  it('escapa comillas para poder usarlo en atributos', () => {
    expect(escapeHtml(`"' onmouseover=alert(1)`)).toBe('&quot;&#39; onmouseover=alert(1)');
  });
});
