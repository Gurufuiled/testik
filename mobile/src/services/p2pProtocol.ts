/**
 * Binary protocol for P2P DataChannel messaging.
 * Format: [1 byte type][36 bytes messageId][payload]
 */

export const MessageType = {
  TextMessage: 0,
  VoiceChunk: 1,
  VideoChunk: 2,
  MediaMetadata: 3,
  Ack: 4,
  Typing: 5,
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

const MESSAGE_ID_LENGTH = 36;
const HEADER_LENGTH = 1 + MESSAGE_ID_LENGTH;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

/**
 * Converts messageId string to fixed 36-byte buffer.
 * Pads with zeros if short, truncates if long (UUID format).
 */
export function messageIdToBytes(messageId: string): Uint8Array {
  if (messageId == null) return new Uint8Array(MESSAGE_ID_LENGTH);
  const bytes = textEncoder.encode(messageId);
  const result = new Uint8Array(MESSAGE_ID_LENGTH);
  const copyLen = Math.min(bytes.length, MESSAGE_ID_LENGTH);
  result.set(bytes.subarray(0, copyLen));
  return result;
}

/**
 * Encodes a P2P message into ArrayBuffer.
 * - TextMessage, Typing: payload is string (UTF-8 encoded)
 * - Others: payload is Uint8Array or optional
 */
export function encode(
  type: MessageTypeValue,
  messageId: string,
  payload?: Uint8Array | string
): ArrayBuffer {
  const msgIdBytes = messageIdToBytes(messageId);
  let payloadBytes: Uint8Array;

  if (type === MessageType.TextMessage || type === MessageType.Typing) {
    payloadBytes =
      typeof payload === 'string' ? textEncoder.encode(payload) : new Uint8Array(0);
  } else {
    payloadBytes = payload instanceof Uint8Array ? payload : new Uint8Array(0);
  }

  const totalLen = HEADER_LENGTH + payloadBytes.length;
  const buffer = new ArrayBuffer(totalLen);
  const view = new Uint8Array(buffer);
  view[0] = type;
  view.set(msgIdBytes, 1);
  if (payloadBytes.length > 0) {
    view.set(payloadBytes, HEADER_LENGTH);
  }
  return buffer;
}

/**
 * Decodes a P2P message from ArrayBuffer.
 * Returns null on parse error.
 * messageId: trim trailing zeros from 36-byte slice, decode as UTF-8.
 */
export function decode(
  buffer: ArrayBuffer
): { type: number; messageId: string; payload: Uint8Array } | null {
  if (buffer.byteLength < HEADER_LENGTH) {
    return null;
  }
  const view = new Uint8Array(buffer);
  const type = view[0];
  const VALID_TYPES = new Set([0, 1, 2, 3, 4, 5]);
  if (!VALID_TYPES.has(type)) return null;

  const msgIdSlice = view.subarray(1, 1 + MESSAGE_ID_LENGTH);
  // Trim trailing zeros for messageId
  let end = msgIdSlice.length;
  while (end > 0 && msgIdSlice[end - 1] === 0) {
    end--;
  }
  const messageId = textDecoder.decode(msgIdSlice.subarray(0, end));
  const payload =
    buffer.byteLength > HEADER_LENGTH
      ? view.subarray(HEADER_LENGTH)
      : new Uint8Array(0);
  return { type, messageId, payload };
}
