/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { JWTAuthAdapter } from '../JWTAuthAdapter';

describe('JWTAuthAdapter', () => {
  const validToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJleHAiOjE3MzQ0NjQ2MDAsImlhdCI6MTczNDQ2MTAwMH0.test-signature';

  describe('constructor', () => {
    it('should create adapter with token', () => {
      const adapter = new JWTAuthAdapter(validToken);
      expect(adapter).toBeDefined();
      expect(adapter.getCurrentToken()).toBe(validToken);
    });
  });

  describe('getCurrentToken', () => {
    it('should return current token', () => {
      const adapter = new JWTAuthAdapter(validToken);
      expect(adapter.getCurrentToken()).toBe(validToken);
    });
  });

  describe('validateToken', () => {
    it('should decode valid JWT token', async () => {
      const adapter = new JWTAuthAdapter(validToken);
      const payload = await adapter.validateToken(validToken);

      expect(payload).toBeDefined();
      expect(payload.userId).toBe('test-user');
      expect(payload.exp).toBe(1734464600);
      expect(payload.iat).toBe(1734461000);
    });

    it('should throw error for invalid token format', async () => {
      const adapter = new JWTAuthAdapter(validToken);

      await expect(adapter.validateToken('invalid-token')).rejects.toThrow(
        'Failed to decode token'
      );
    });

    it('should throw error for token without payload', async () => {
      const adapter = new JWTAuthAdapter(validToken);

      await expect(adapter.validateToken('header..signature')).rejects.toThrow(
        'Failed to decode token'
      );
    });

    it('should decode token with special characters', async () => {
      // Token with URL-safe base64 characters
      const tokenWithSpecialChars =
        'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJkYXRhIjoid2l0aC1kYXNoZXMifQ.sig';

      const adapter = new JWTAuthAdapter(tokenWithSpecialChars);
      const payload = await adapter.validateToken(tokenWithSpecialChars);

      expect(payload.userId).toBe('test-user');
      expect((payload as any).data).toBe('with-dashes');
    });
  });

  describe('isAuthRequired', () => {
    it('should return true', () => {
      const adapter = new JWTAuthAdapter(validToken);
      expect(adapter.isAuthRequired()).toBe(true);
    });
  });
});
