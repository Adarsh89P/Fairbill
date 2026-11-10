/// <reference types="jest" />
import { waNumber } from '../phone';

test('normalises numbers for WhatsApp', () => {
  expect(waNumber('98765 43210')).toBe('919876543210');
  expect(waNumber('098765-43210')).toBe('919876543210');
  expect(waNumber('+91 98765 43210')).toBe('919876543210');
  expect(waNumber('+1 (212) 555-0100')).toBe('12125550100');
  expect(waNumber('0044 20 7946 0958')).toBe('442079460958');
  expect(waNumber('12345')).toBeNull();
  expect(waNumber(undefined)).toBeNull();
});
