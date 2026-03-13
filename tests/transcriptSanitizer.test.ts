import { describe, it, expect } from 'vitest';
import { sanitizeTranscript, isCleanTranscript } from '../services/transcriptSanitizer';

const TELEPHONY_OPTS = {
  preferDevanagari: true,
  dropIsolatedLatinWords: true,
  dropUnclear: true,
  applyTelephonyCorrections: true,
};

describe('transcriptSanitizer', () => {
  describe('clean Marathi passes through', () => {
    it('preserves clean Marathi text', () => {
      const { output } = sanitizeTranscript('माझ्या ऊसाची पानं पिवळी पडली', TELEPHONY_OPTS);
      expect(output).toBeTruthy();
      expect(output).toContain('माझ्या');
    });

    it('preserves normal Hindi/Marathi greetings', () => {
      const { output } = sanitizeTranscript('नमस्कार', TELEPHONY_OPTS);
      expect(output).toBe('नमस्कार');
    });
  });

  describe('Devanagari matra repair', () => {
    it('rejoins consonant + separated matra (ा)', () => {
      const { output } = sanitizeTranscript('म ा झ ् या', TELEPHONY_OPTS);
      expect(output).toBeTruthy();
      // After matra repair, the consonant+matra should be joined
      expect(output).not.toContain('म ा');
    });

    it('keeps separate Devanagari words apart', () => {
      const { output } = sanitizeTranscript('ना ही', TELEPHONY_OPTS);
      expect(output).toBeTruthy();
      // Separate words should remain separate (not merged)
      expect(output).toContain('ना');
    });
  });

  describe('telephony corrections — English → Marathi', () => {
    it('corrects "Marina" to "नाही"', () => {
      const { output } = sanitizeTranscript('Marina.', TELEPHONY_OPTS);
      expect(output).toBe('नाही');
    });

    it('corrects "ok" to "ठीक आहे"', () => {
      const { output } = sanitizeTranscript('ok', TELEPHONY_OPTS);
      expect(output).toBe('ठीक आहे');
    });

    it('corrects "yes" to "हो"', () => {
      const { output } = sanitizeTranscript('yes', TELEPHONY_OPTS);
      expect(output).toBe('हो');
    });

    it('corrects "hello" to "नमस्कार"', () => {
      const { output } = sanitizeTranscript('hello', TELEPHONY_OPTS);
      expect(output).toBe('नमस्कार');
    });

    it('corrects "bye" to "धन्यवाद"', () => {
      const { output } = sanitizeTranscript('bye', TELEPHONY_OPTS);
      expect(output).toBe('धन्यवाद');
    });

    it('corrects "no" to "नाही"', () => {
      const { output } = sanitizeTranscript('no', TELEPHONY_OPTS);
      expect(output).toBe('नाही');
    });
  });

  describe('telephony corrections — French hallucinations', () => {
    it('corrects "Ce n\'a eu pe cameron" to "छान आहे"', () => {
      const { output } = sanitizeTranscript("Ce n'a eu pe cameron", TELEPHONY_OPTS);
      expect(output).toBeTruthy();
      expect(output).toContain('छान आहे');
    });

    it('corrects "oui" to "हो"', () => {
      const { output } = sanitizeTranscript('oui', TELEPHONY_OPTS);
      expect(output).toBe('हो');
    });

    it('corrects "non" to "नाही"', () => {
      const { output } = sanitizeTranscript('non', TELEPHONY_OPTS);
      expect(output).toBe('नाही');
    });

    it('corrects "pe cameron" substring in longer text', () => {
      const { output } = sanitizeTranscript('ते pe cameron', TELEPHONY_OPTS);
      expect(output).toBeTruthy();
      expect(output).toContain('छान');
    });
  });

  describe('noise and junk filtering', () => {
    it('drops noise-only text', () => {
      const { output } = sanitizeTranscript('hmm', TELEPHONY_OPTS);
      expect(output).toBeNull();
    });

    it('drops single character remnants', () => {
      const { output } = sanitizeTranscript('a', TELEPHONY_OPTS);
      expect(output).toBeNull();
    });

    it('strips non-Latin/non-Devanagari scripts', () => {
      const { output } = sanitizeTranscript('テスト', TELEPHONY_OPTS);
      expect(output).toBeNull();
    });
  });

  describe('isCleanTranscript helper', () => {
    it('returns true for clean Marathi', () => {
      expect(isCleanTranscript('हो बोला')).toBe(true);
    });

    it('returns false for noise', () => {
      expect(isCleanTranscript('hmm')).toBe(false);
    });
  });
});
