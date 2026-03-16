/**
 * Theme colors and typography for messenger UI.
 */

export const colors = {
  textPrimary: '#000',
  textSecondary: '#666',
  textSecondaryMuted: 'rgba(255,255,255,0.8)',
  placeholder: '#999',
  accent: '#007AFF',
  disabled: '#ccc',
  separator: '#e0e0e0',
  chatBackground: '#f5f5f5',
  inputBackground: '#e8e8e8',
  buttonBackground: '#e0e0e0',
  header: '#007AFF',
  bubbleMe: '#007AFF',
  bubbleOther: '#e5e5ea',
  placeholderBg: '#e0e0e0',
};

export const typography = {
  messageText: 16,
  messageTextLineHeight: 22,
  timeStatus: 12,
};

export const MIN_TAP_TARGET = 44;

export const bubbleRadius = {
  mine: { borderTopLeftRadius: 18, borderTopRightRadius: 4, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  other: { borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
};
