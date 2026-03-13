import { describe, it, expect } from 'vitest';
import { detectLoanPurpose } from '../services/purposeDetection';

describe('purposeDetection', () => {
  describe('detectLoanPurpose', () => {
    it('returns "travel" for travel-related phrases', () => {
      expect(detectLoanPurpose('हो प्रवासासाठी लोन पाहतोय')).toBe('travel');
      expect(detectLoanPurpose('प्रवासासाठी मी लोन पाहत आहे')).toBe('travel');
      expect(detectLoanPurpose('शादी के लिए लोन')).not.toBe('travel');
      expect(detectLoanPurpose('I need loan for travel')).toBe('travel');
    });

    it('returns "medical" for medical-related phrases', () => {
      expect(detectLoanPurpose('माझ्या आईच्या उपचारासाठी')).toBe('medical');
      expect(detectLoanPurpose('आरोग्य खर्चासाठी')).toBe('medical');
      expect(detectLoanPurpose('medical treatment')).toBe('medical');
    });

    it('returns "wedding" for wedding-related phrases', () => {
      expect(detectLoanPurpose('शादी के लिए लोन')).toBe('wedding');
      expect(detectLoanPurpose('लग्नासाठी कर्ज')).toBe('wedding');
      expect(detectLoanPurpose('wedding expense')).toBe('wedding');
    });

    it('returns "renovation" for home renovation phrases', () => {
      expect(detectLoanPurpose('घराची दुरुस्ती')).toBe('renovation');
      expect(detectLoanPurpose('home renovation')).toBe('renovation');
    });

    it('returns "general" when no purpose detected', () => {
      expect(detectLoanPurpose('I need a loan')).toBe('general');
      expect(detectLoanPurpose('')).toBe('general');
    });
  });
});
