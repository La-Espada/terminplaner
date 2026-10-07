import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenPurpose, ConsentType, Prisma } from '@prisma/client';
import { aktuelleVersion } from '../consents/consent-katalog';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenService } from './auth-token.service';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenService, type TokenPaar } from './token.service';

/** Gültigkeit des Verifizierungslinks. */
const VERIFIZIERUNG_GUELTIG_MINUTEN = 24 * 60;

/**
 * Gültigkeit des Reset-Links. Deutlich kürzer als bei der Verifizierung: Der
 * Link kann ein Konto übernehmen, also soll er nicht tagelang in einem
 * Postfach herumliegen.
 */
const RESET_GUELTIG_MINUTEN = 60;

/**
 * Argon2id-Hash eines zufälligen Werts. Wird geprüft, wenn es die Adresse nicht
 * gibt, damit die Antwortzeit keinen Rückschluss zulässt.
 */
const BLIND_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$AJoTB1Zx9F7gGGDKBsM/1Yw+7uSVsCLkDh6fGkULxEo';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokenService,
    private readonly mail: MailService,
    private readonly sitzungen: TokenService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registrierung.
   *
   * Antwortet **immer gleich**, egal ob die Adresse schon vergeben ist. Sonst
   * wird der Endpunkt zum Verzeichnis: Wer wissen will, ob jemand Kundin dieser
   * Praxis ist, probiert einfach die Adresse durch. Bei einer Arztpraxis wäre
   * schon diese Information heikel.
   *
   * Existiert die Adresse bereits, geht stattdessen ein Hinweis an die bekannte
   * Adresse — wer dort nicht hineinsieht, erfährt nichts.
   */
  async register(dto: RegisterDto): Promise<void> {
    if (!dto.acceptedTerms || !dto.acceptedPrivacy) {
      throw new BadRequestException('AGB und Datenschutzerklärung müssen akzeptiert werden.');
    }

    const passwordHash = await this.passwords.hashPassword(dto.password);

    let userId: string;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const angelegt = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            role: 'CUSTOMER',
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone ?? null,
          },
          select: { id: true },
        });

        await tx.consent.createMany({
          data: [
            this.consent(angelegt.id, 'TOS', true),
            this.consent(angelegt.id, 'PRIVACY', true),
            this.consent(angelegt.id, 'MARKETING', dto.acceptedMarketing === true),
          ],
        });

        return angelegt;
      });
      userId = user.id;
    } catch (fehler) {
      if (fehler instanceof Prisma.PrismaClientKnownRequestError && fehler.code === 'P2002') {
        // Adresse ist vergeben. Nach außen nicht unterscheidbar.
        this.logger.log('Registrierung auf bereits vergebene Adresse');
        return;
      }
      throw fehler;
    }

    const klartext = await this.tokens.issue(
      userId,
      AuthTokenPurpose.EMAIL_VERIFICATION,
      VERIFIZIERUNG_GUELTIG_MINUTEN,
    );

    await this.mail.sendVerificationMail(dto.email, dto.firstName, this.verifyLink(klartext));
  }

  /**
   * E-Mail-Verifizierung. Der Token wirkt genau einmal.
   *
   * Ist er bereits verbraucht, das Konto aber verifiziert, melden wir Erfolg —
   * ein zweiter Klick auf denselben Link in der Mail soll keinen Fehler zeigen.
   */
  async verifyEmail(token: string): Promise<void> {
    const userId = await this.tokens.redeem(token, AuthTokenPurpose.EMAIL_VERIFICATION);

    if (!userId) {
      throw new BadRequestException('Der Link ist ungültig oder abgelaufen.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    this.logger.log('E-Mail-Adresse bestätigt');
  }

  /**
   * Anmeldung.
   *
   * Falsches Passwort und unbekannte Adresse liefern **dieselbe** Antwort. Sonst
   * verrät der Login, was die Registrierung in Schritt 8 gerade verbirgt: wer
   * hier Patientin ist.
   *
   * Auch bei unbekannter Adresse wird ein Hash geprüft. Ohne diesen Leerlauf
   * antwortet der Server messbar schneller, wenn es die Adresse nicht gibt —
   * und die Auskunft wäre über die Antwortzeit wieder zu haben.
   */
  async login(email: string, passwort: string): Promise<TokenPaar> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, role: true, status: true, emailVerifiedAt: true },
    });

    const stimmt = user
      ? await this.passwords.verifyPassword(user.passwordHash, passwort)
      : await this.passwords.verifyPassword(BLIND_HASH, passwort);

    if (!user || !stimmt) {
      throw new UnauthorizedException('E-Mail-Adresse oder Passwort ist falsch.');
    }

    if (user.status !== 'ACTIVE') {
      // Gesperrt oder anonymisiert. Bewusst dieselbe Meldung.
      this.logger.warn('Anmeldeversuch auf nicht aktivem Konto');
      throw new UnauthorizedException('E-Mail-Adresse oder Passwort ist falsch.');
    }

    if (user.emailVerifiedAt === null) {
      // Hier ist eine eigene Meldung richtig: Die Person kennt ihr Passwort,
      // es gibt also nichts mehr zu verbergen, und sie braucht die Anleitung.
      throw new UnauthorizedException(
        'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse über den Link in der Anmeldemail.',
      );
    }

    this.logger.log(`Anmeldung erfolgreich, Rolle ${user.role}`);
    return this.sitzungen.issuePair(user.id, user.role);
  }

  /**
   * Passwort-Reset anfordern.
   *
   * Antwortet **immer gleich**, egal ob es die Adresse gibt. Andernfalls wäre
   * dieser Endpunkt das Verzeichnis, das Registrierung und Login gerade
   * verbergen — und zwar ein besonders bequemes, weil er keine Anmeldedaten
   * braucht.
   *
   * Gesperrte und anonymisierte Konten bekommen keinen Link. Ein anonymisiertes
   * Konto hat ohnehin keine gültige Adresse mehr.
   */
  async anfordernPasswortReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, email: true, status: true },
    });

    if (user === null || user.status !== 'ACTIVE') {
      // Bewusst ohne Adresse im Log.
      this.logger.log('Passwort-Reset für unbekanntes oder inaktives Konto angefordert');
      return;
    }

    const klartext = await this.tokens.issue(
      user.id,
      AuthTokenPurpose.PASSWORD_RESET,
      RESET_GUELTIG_MINUTEN,
    );

    await this.mail.sendPasswordResetMail(user.email, user.firstName, this.resetLink(klartext));
    this.logger.log('Passwort-Reset angefordert');
  }

  /**
   * Neues Passwort setzen.
   *
   * Danach werden **alle** Sitzungen entwertet, nicht nur die aktuelle. Wer sein
   * Passwort zurücksetzt, tut das häufig, weil er einen Zugriff befürchtet —
   * dann muss auch eine bereits gestohlene Sitzung sterben.
   */
  async zuruecksetzenPasswort(token: string, neuesPasswort: string): Promise<void> {
    const userId = await this.tokens.redeem(token, AuthTokenPurpose.PASSWORD_RESET);

    if (userId === null) {
      throw new BadRequestException('Der Link ist ungültig oder abgelaufen.');
    }

    const passwordHash = await this.passwords.hashPassword(neuesPasswort);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        // Wer den Link aus dem Postfach geholt hat, hat damit bewiesen, dass die
        // Adresse ihm gehört. Ein unbestätigtes Konto gilt danach als bestätigt —
        // sonst säße jemand fest, der sich registriert, die Bestätigungsmail
        // verpasst und das Passwort vergessen hat.
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, firstName: true },
    });

    await this.sitzungen.revokeAll(user.id);

    // Benachrichtigung an die bekannte Adresse. War der Reset nicht gewollt,
    // erfährt die rechtmäßige Inhaberin davon.
    await this.mail.sendPasswordChangedMail(user.email, user.firstName);

    this.logger.log('Passwort zurückgesetzt, alle Sitzungen entwertet');
  }

  /**
   * Einladung einloesen: erstes Passwort fuer ein vom Studio angelegtes Konto.
   *
   * Technisch fast ein Passwort-Reset, mit zwei Unterschieden. Erstens faellt
   * die Mail "Ihr Passwort wurde geaendert" weg — es wurde nichts geaendert,
   * sondern erstmals vergeben, und eine Warnmeldung zum eigenen Klick
   * verunsichert nur. Zweitens wird das Konto dabei freigeschaltet: Wer den
   * Link aus seinem Postfach geholt hat, hat die Adresse bewiesen.
   */
  async einloesenEinladung(token: string, passwort: string): Promise<void> {
    const userId = await this.tokens.redeem(token, AuthTokenPurpose.INVITATION);

    if (userId === null) {
      throw new BadRequestException(
        'Diese Einladung ist ungueltig oder abgelaufen. Bitte lassen Sie sich eine neue schicken.',
      );
    }

    const passwordHash = await this.passwords.hashPassword(passwort);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, emailVerifiedAt: new Date(), status: 'ACTIVE' },
      select: { id: true },
    });

    // Es sollte gar keine Sitzung geben — bis hierher konnte sich niemand
    // anmelden. Der Aufruf kostet nichts und schliesst den Fall aus, dass eine
    // zweite Einladung ein zwischenzeitlich uebernommenes Konto offen laesst.
    await this.sitzungen.revokeAll(user.id);

    this.logger.log('Einladung eingeloest, Passwort vergeben');
  }

  private consent(userId: string, type: ConsentType, granted: boolean) {
    return {
      userId,
      type,
      version: aktuelleVersion(type),
      granted,
      grantedAt: new Date(),
    };
  }

  private resetLink(token: string): string {
    const basis = this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
    return `${basis}/passwort-neu?token=${encodeURIComponent(token)}`;
  }

  private verifyLink(token: string): string {
    const basis = this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
    return `${basis}/verify-email?token=${encodeURIComponent(token)}`;
  }
}
