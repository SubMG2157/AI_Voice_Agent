import { describe, it, expect } from 'vitest';
import { isValidConsent, isNotConsent } from '../services/consentGate';

describe('consentGate', () => {
  describe('isValidConsent', () => {
    it('returns true for explicit consent phrases', () => {
      expect(isValidConsent('yes')).toBe(true);
      expect(isValidConsent('sure')).toBe(true);
      expect(isValidConsent('okay')).toBe(true);
      expect(isValidConsent('हाँ')).toBe(true);
      expect(isValidConsent('ठीक है')).toBe(true);
      expect(isValidConsent('हो')).toBe(true);
    });

    it('returns false for non-consent', () => {
      expect(isValidConsent('hello')).toBe(false);
      expect(isValidConsent('if')).toBe(false);
    });
  });

  describe('isNotConsent', () => {
    it('returns true for hello, if, noise', () => {
      expect(isNotConsent('hello')).toBe(true);
      expect(isNotConsent('if')).toBe(true);
    });

    it('returns false for valid consent', () => {
      expect(isNotConsent('yes')).toBe(false);
      expect(isNotConsent('sure')).toBe(false);
    });
  });
});
