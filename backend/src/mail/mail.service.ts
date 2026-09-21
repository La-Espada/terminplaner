import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * E-Mail-Versand.
 *
 * Lokal geht alles an Mailpit (http://localhost:8025), es verlässt nichts den
 * Rechner. In Produktion kommt ein EU-Anbieter dahinter.
 *
 * Grundregel: **Keine Gesundheitsdaten in E-Mails.** Weder Behandlungsnotizen
 * noch der Freitext der Kundin, nicht einmal der Name der Leistung, wenn er
 * Rückschlüsse zulässt. Siehe docs/PLAN.md Abschnitt 8.4.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly absender: string;

  constructor(private readonly config: ConfigService) {
    this.absender = this.config.get<string>('MAIL_FROM', 'noreply@example.invalid');
    this.transporter = createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 1025),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      // Mailpit nimmt alles ohne Anmeldung entgegen.
      ignoreTLS: this.config.get<string>('NODE_ENV') !== 'production',
    });
  }

  private async send(an: string, betreff: string, text: string, html: string): Promise<void> {
    await this.transporter.sendMail({ from: this.absender, to: an, subject: betreff, text, html });
    // Absichtlich ohne Inhalt und ohne vollständige Adresse im Log.
    this.logger.log(`Mail versendet: ${betreff}`);
  }

  async sendVerificationMail(an: string, vorname: string, link: string): Promise<void> {
    const betreff = 'Bitte bestätigen Sie Ihre E-Mail-Adresse';
    const text = [
      `Guten Tag ${vorname},`,
      '',
      'bitte bestätigen Sie Ihre E-Mail-Adresse über diesen Link:',
      link,
      '',
      'Der Link ist 24 Stunden gültig.',
      '',
      'Falls Sie sich nicht registriert haben, können Sie diese Nachricht ignorieren.',
    ].join('\n');

    const html = `
      <p>Guten Tag ${escapeHtml(vorname)},</p>
      <p>bitte bestätigen Sie Ihre E-Mail-Adresse:</p>
      <p><a href="${escapeHtml(link)}">E-Mail-Adresse bestätigen</a></p>
      <p>Der Link ist 24 Stunden gültig.</p>
      <p style="color:#6f6f69">Falls Sie sich nicht registriert haben, können Sie diese
      Nachricht ignorieren.</p>`;

    await this.send(an, betreff, text, html);
  }

  async sendPasswordResetMail(an: string, vorname: string, link: string): Promise<void> {
    const betreff = 'Passwort zurücksetzen';
    const text = [
      `Guten Tag ${vorname},`,
      '',
      'über diesen Link können Sie ein neues Passwort vergeben:',
      link,
      '',
      'Der Link ist 60 Minuten gültig und funktioniert nur einmal.',
      '',
      'Falls Sie das nicht angefordert haben, ist nichts geschehen — Ihr bisheriges',
      'Passwort bleibt gültig.',
    ].join('\n');

    const html = `
      <p>Guten Tag ${escapeHtml(vorname)},</p>
      <p>über diesen Link können Sie ein neues Passwort vergeben:</p>
      <p><a href="${escapeHtml(link)}">Neues Passwort vergeben</a></p>
      <p>Der Link ist 60 Minuten gültig und funktioniert nur einmal.</p>
      <p style="color:#6f6f69">Falls Sie das nicht angefordert haben, ist nichts geschehen —
      Ihr bisheriges Passwort bleibt gültig.</p>`;

    await this.send(an, betreff, text, html);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
