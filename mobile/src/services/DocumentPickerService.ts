/**
 * DocumentPickerService - Picks documents from the device.
 * Uses expo-document-picker for file selection.
 *
 * Note: On web, getDocumentAsync must be called after user activation (e.g. button press).
 * Cancel behavior may vary across browsers.
 */

import * as DocumentPicker from 'expo-document-picker';

/** Common MIME types for messenger attachments (images, docs, pdf, etc.) */
const COMMON_TYPES = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/octet-stream',
];

export interface DocumentPickerResult {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}

class DocumentPickerServiceClass {
  /**
   * Pick a document from the device.
   * @returns { uri, name, size, mimeType? } or null on cancel/error
   */
  async pickDocument(): Promise<DocumentPickerResult | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: COMMON_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return null;
      }

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        name: asset.name,
        size: asset.size ?? 0,
        mimeType: asset.mimeType,
      };
    } catch (err) {
      if (__DEV__) {
        console.warn('[DocumentPickerService] pickDocument error:', err);
      }
      return null;
    }
  }
}

export const DocumentPickerService = new DocumentPickerServiceClass();
