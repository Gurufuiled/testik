/**
 * ImagePickerService - Picks images from the device library.
 * Supports optional compression via expo-image-manipulator.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_DIMENSION = 1920;
const COMPRESS_QUALITY = 0.8;

export interface ImagePickerResult {
  uri: string;
  width?: number;
  height?: number;
}

class ImagePickerServiceClass {
  /** Request media library permission. Returns true if granted. */
  async requestPermissions(): Promise<boolean> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Pick an image from the library.
   * @param options.compress - If true, resize (max 1920px) and compress (quality 0.8)
   * @returns { uri, width?, height? } or null on cancel/error
   */
  async pickImage(options?: { compress?: boolean }): Promise<ImagePickerResult | null> {
    try {
      const granted = await this.requestPermissions();
      if (!granted) {
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: options?.compress ? COMPRESS_QUALITY : 1,
      });

      if (result.canceled || !result.assets?.[0]) {
        return null;
      }

      const asset = result.assets[0];
      let uri = asset.uri;
      let width = asset.width ?? undefined;
      let height = asset.height ?? undefined;

      if (options?.compress && uri) {
        const w = width ?? 0;
        const h = height ?? 0;
        const needsResize = w > MAX_DIMENSION || h > MAX_DIMENSION;

        const actions = needsResize
          ? [{ resize: w >= h ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION } }]
          : [];

        const manipulated = await ImageManipulator.manipulateAsync(uri, actions, {
          compress: COMPRESS_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
        });

        uri = manipulated.uri;
        width = manipulated.width;
        height = manipulated.height;
      }

      return { uri, width, height };
    } catch (err) {
      if (__DEV__) {
        console.warn('[ImagePickerService] pickImage error:', err);
      }
      return null;
    }
  }
}

export const ImagePickerService = new ImagePickerServiceClass();
