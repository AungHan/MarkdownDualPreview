import { describe, expect, it } from 'vitest';
import { isFromWebviewMessage } from '../../src/shared/messages';

describe('isFromWebviewMessage', () => {
  it('accepts a valid ready message', () => {
    expect(isFromWebviewMessage({ type: 'ready' })).toBe(true);
  });

  it('accepts a valid scrollChanged message', () => {
    expect(isFromWebviewMessage({ type: 'scrollChanged', line: 42 })).toBe(true);
  });

  it('rejects scrollChanged without a numeric line', () => {
    expect(isFromWebviewMessage({ type: 'scrollChanged', line: '42' })).toBe(false);
    expect(isFromWebviewMessage({ type: 'scrollChanged' })).toBe(false);
  });

  it('accepts a valid tocToggled message', () => {
    expect(isFromWebviewMessage({ type: 'tocToggled', collapsed: true })).toBe(true);
    expect(isFromWebviewMessage({ type: 'tocToggled', collapsed: false })).toBe(true);
  });

  it('rejects tocToggled without a boolean collapsed', () => {
    expect(isFromWebviewMessage({ type: 'tocToggled', collapsed: 'yes' })).toBe(false);
  });

  it('accepts a valid copyText message', () => {
    expect(isFromWebviewMessage({ type: 'copyText', text: 'hello' })).toBe(true);
    expect(isFromWebviewMessage({ type: 'copyText', text: '' })).toBe(true);
  });

  it('rejects copyText without a string text', () => {
    expect(isFromWebviewMessage({ type: 'copyText', text: 123 })).toBe(false);
    expect(isFromWebviewMessage({ type: 'copyText' })).toBe(false);
  });

  it('accepts a valid checkboxToggled message', () => {
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: 3, checked: true })).toBe(true);
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: 0, checked: false })).toBe(true);
  });

  it('rejects checkboxToggled without a numeric line', () => {
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: '3', checked: true })).toBe(
      false
    );
    expect(isFromWebviewMessage({ type: 'checkboxToggled', checked: true })).toBe(false);
  });

  it('rejects checkboxToggled with a negative, fractional, or non-finite line', () => {
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: -1, checked: true })).toBe(
      false
    );
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: 1.5, checked: true })).toBe(
      false
    );
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: NaN, checked: true })).toBe(
      false
    );
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: Infinity, checked: true })).toBe(
      false
    );
  });

  it('rejects checkboxToggled without a boolean checked', () => {
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: 3, checked: 'true' })).toBe(
      false
    );
    expect(isFromWebviewMessage({ type: 'checkboxToggled', line: 3 })).toBe(false);
  });

  it('rejects unknown message types', () => {
    expect(isFromWebviewMessage({ type: 'unknown' })).toBe(false);
  });

  it('rejects non-object values', () => {
    expect(isFromWebviewMessage(null)).toBe(false);
    expect(isFromWebviewMessage(undefined)).toBe(false);
    expect(isFromWebviewMessage(42)).toBe(false);
    expect(isFromWebviewMessage('ready')).toBe(false);
  });
});
