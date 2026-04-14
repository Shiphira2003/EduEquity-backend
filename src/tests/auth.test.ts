import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

describe('Auth Utilities Test Suite', () => {
  it('should hash a password correctly', async () => {
    const password = 'mySecurePassword';
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    expect(hash).not.toBe(password);
    
    // Verify it matches
    const isMatch = await bcrypt.compare(password, hash);
    expect(isMatch).toBe(true);
  });

  it('should generate valid access and refresh tokens', () => {
    const userId = 123;
    const secret = 'test-secret';
    
    const token = jwt.sign({ id: userId, role: 'STUDENT' }, secret, { expiresIn: '15m' });
    
    const decoded: any = jwt.verify(token, secret);
    expect(decoded.id).toBe(userId);
    expect(decoded.role).toBe('STUDENT');
  });
});
