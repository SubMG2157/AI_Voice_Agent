import { describe, it, expect } from 'vitest';
import { classifyIntent, isBlockedIntent } from '../services/domainGuard';

describe('domainGuard', () => {
  describe('classifyIntent', () => {
    it('returns BLOCKED for math questions', () => {
      expect(classifyIntent('एक प्लस एक कितना होता है')).toBe('BLOCKED');
      expect(classifyIntent('one plus one')).toBe('BLOCKED');
    });

    it('returns BLOCKED for AI identity questions', () => {
      expect(classifyIntent('क्या आप एआई है')).toBe('BLOCKED');
      expect(classifyIntent('are you ai')).toBe('BLOCKED');
    });

    it('returns BLOCKED for "who built you" questions', () => {
      expect(classifyIntent('आपको किसने बनाया है')).toBe('BLOCKED');
      expect(classifyIntent('who built you')).toBe('BLOCKED');
      expect(classifyIntent('मुझे गूगल ने बनाया है')).toBe('BLOCKED');
    });

    it('returns allowed intent for in-domain utterances', () => {
      expect(classifyIntent('कल शाम को कॉल करें')).not.toBe('BLOCKED');
      expect(classifyIntent('I need a personal loan')).not.toBe('BLOCKED');
      expect(classifyIntent('Yes send me the link')).not.toBe('BLOCKED');
    });
  });

  describe('isBlockedIntent', () => {
    it('returns true for out-of-domain questions', () => {
      expect(isBlockedIntent('एक प्लस एक कितना होता है')).toBe(true);
      expect(isBlockedIntent('क्या आप एआई है')).toBe(true);
    });

    it('returns false for loan/callback related text', () => {
      expect(isBlockedIntent('कल शाम को')).toBe(false);
      expect(isBlockedIntent('रिलेशनशिप मैनेजर को बताइए कल कॉल करें')).toBe(false);
    });
  });
});
