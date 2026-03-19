/**
 * Theme colors and typography for messenger UI.
 */

export const colors = {
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textSecondaryMuted: 'rgba(255,255,255,0.8)',
  placeholder: '#999',
  accent: '#4D8DFF',
  disabled: '#ccc',
  separator: '#d8e0ea',
  chatBackground: '#f6f8fb',
  inputBackground: '#eef2f7',
  buttonBackground: '#e6ebf2',
  header: '#eaf3ff',
  bubbleMe: '#4D8DFF',
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
