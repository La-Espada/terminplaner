import { hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

/**
 * Passwort-Hashing mit Argon2id.
 *
 * Argon2id ist die vom BSI und OWASP empfohlene Wahl: speicherhart, damit
 * Angriffe mit Grafikkarten teuer bleiben. Die Parameter folgen den
 * OWASP-Mindestwerten (19 MiB Speicher, 2 Durchläufe, 1 Faden).
 */
@Injectable()
export class PasswordService {
  private readonly optionen = {
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  async hashPassword(klartext: string): Promise<string> {
    return hash(klartext, this.optionen);
  }

  /**
   * Prüft ein Passwort. Wirft nie, sondern liefert bei kaputtem Hash `false` —
   * ein Fehler hier darf keine Information über den Kontozustand preisgeben.
   */
  async verifyPassword(gespeicherterHash: string, klartext: string): Promise<boolean> {
    try {
      return await verify(gespeicherterHash, klartext);
    } catch {
      return false;
    }
  }
}
