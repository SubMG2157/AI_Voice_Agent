import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectLanguage,
  resetLanguageController,
  maybeSwitchLanguage,
  type LanguageSwitchContext,
} from '../services/languageDetection';

describe('languageDetection', () => {
  beforeEach(() => {
    resetLanguageController();
  });

  describe('detectLanguage', () => {
    it('returns "mr" for Marathi confirmation phrases', () => {
      expect(detectLanguage('हो बोला ना')).toBe('mr');
      expect(detectLanguage('हो बोला')).toBe('mr');
      expect(detectLanguage('ठीक आहे')).toBe('mr');
    });

    it('returns "hi" for Hindi confirmation phrases', () => {
      expect(detectLanguage('हाँ बोलिए')).toBe('hi');
      expect(detectLanguage('जी बोलिए')).toBe('hi');
      expect(detectLanguage('ठीक है')).toBe('hi');
    });

    it('returns "hi" for "कल शाम को" (Hindi-first when ambiguous)', () => {
      expect(detectLanguage('कल शाम को')).toBe('hi');
    });

    it('returns "hi" for callback time in Hindi', () => {
      expect(detectLanguage('कल शाम को कॉल करें')).toBe('hi');
    });

    it('returns "mr" for Marathi purpose phrase', () => {
      expect(detectLanguage('हो प्रवासासाठी मी लोन पाहत आहे')).toBe('mr');
    });

    it('returns "en" for English', () => {
      expect(detectLanguage('Yes sure')).toBe('en');
      expect(detectLanguage('Hello')).toBe('en');
    });

    it('returns "unknown" for empty or whitespace', () => {
      expect(detectLanguage('')).toBe('unknown');
      expect(detectLanguage('   ')).toBe('unknown');
    });

    it('returns "en" for single "okay" (Latin fallback)', () => {
      expect(detectLanguage('okay')).toBe('en');
    });

    it('returns "hi" for Hindi override phrases (e.g. after Marathi) – नहीं मुझे चाहिए', () => {
      expect(detectLanguage('नहीं मुझे एजुकेशन लोन के रिगार्डिंग इंफॉर्मेशन चाहिए')).toBe('hi');
      expect(detectLanguage('मुझे होम लोन बताइए')).toBe('hi');
    });

    it('returns language for explicit language requests', () => {
      expect(detectLanguage('हिंदी में बोलो')).toBe('hi');
      expect(detectLanguage('मराठी बोला')).toBe('mr');
      expect(detectLanguage('in english')).toBe('en');
    });
  });

  describe('maybeSwitchLanguage (explicit + 2-turn confidence)', () => {
    it('switches immediately on explicit request', () => {
      const ctx: LanguageSwitchContext = { language: 'en', languageConfidence: 0 };
      maybeSwitchLanguage('मराठीत बोला', ctx);
      expect(ctx.language).toBe('mr');
      expect(ctx.languageConfidence).toBe(0);
    });

    it('does not switch on single Hinglish/mixed phrase', () => {
      const ctx: LanguageSwitchContext = { language: 'en', languageConfidence: 0 };
      maybeSwitchLanguage('टुडे इवनिंग 5 क्लॉक', ctx);
      expect(ctx.language).toBe('en');
    });

    it('switches after two full consecutive turns in other language', () => {
      const ctx: LanguageSwitchContext = { language: 'en', languageConfidence: 0 };
      maybeSwitchLanguage('मला आज संध्याकाळी कॉल करा', ctx);
      expect(ctx.language).toBe('en');
      expect(ctx.languageConfidence).toBe(1);
      maybeSwitchLanguage('पाच वाजता', ctx);
      expect(ctx.language).toBe('mr');
      expect(ctx.languageConfidence).toBe(0);
    });
  });
});
