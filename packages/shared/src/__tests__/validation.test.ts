import { validateEmail, validateTenantId, validateRequired } from '../validation';

describe('Validation utilities', () => {
  describe('validateEmail', () => {
    it('should validate correct email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(validateEmail('invalid-email')).toBe(false);
    });
  });

  describe('validateTenantId', () => {
    it('should validate correct tenant ID', () => {
      expect(validateTenantId('cliente-123')).toBe(true);
    });

    it('should reject invalid tenant ID', () => {
      expect(validateTenantId('ab')).toBe(false);
      expect(validateTenantId('invalid@tenant')).toBe(false);
    });
  });

  describe('validateRequired', () => {
    it('should return value if not null', () => {
      expect(validateRequired('test', 'field')).toBe('test');
    });

    it('should throw if null', () => {
      expect(() => validateRequired(null, 'field')).toThrow();
    });
  });
});
