import React, { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';
import { colors, typography, MIN_TAP_TARGET } from '../theme/colors';

/** Unicode icons: ⊕ attach, ◉ video note, ● mic record */
const ICON_ATTACH = '\u2295';
const ICON_VIDEO_NOTE = '\u25C9';
const ICON_MIC = '\u25CF';
import { GestureDetector } from 'react-native-gesture-handler';
import { useVoiceRecordGesture } from '../hooks/useVoiceRecordGesture';
import { DocumentPickerService } from '../services/DocumentPickerService';
import { ImagePickerService } from '../services/ImagePickerService';
import type { VoiceRecordingResult } from '../services/VoiceRecorderService';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import { VideoNoteRecorder } from './VideoNoteRecorder';

export interface ImagePickResult {
  uri: string;
  width?: number;
  height?: number;
}

export interface FilePickResult {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}

export interface InputBarProps {
  onSendText: (text: string) => void;
  onSendVoice: (result: VoiceRecordingResult) => void | Promise<void>;
  onSendVideoNote?: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onSendImage?: (result: ImagePickResult) => void | Promise<void>;
  onSendFile?: (result: FilePickResult) => void | Promise<void>;
  placeholder?: string;
  onInputChange?: (text: string) => void;
}

export function InputBar({
  onSendText,
  onSendVoice,
  onSendVideoNote,
  onSendImage,
  onSendFile,
  placeholder = 'Message',
  onInputChange,
}: InputBarProps) {
  const [inputText, setInputText] = useState('');
  const [showVideoNoteRecorder, setShowVideoNoteRecorder] = useState(false);

  const handleSendText = useCallback(() => {
    const content = inputText.trim();
    if (!content) return;
    setInputText('');
    onSendText(content);
  }, [inputText, onSendText]);

  const handleInputChange = useCallback(
    (text: string) => {
      setInputText(text);
      onInputChange?.(text);
    },
    [onInputChange]
  );

  const { gesture: voiceGesture } = useVoiceRecordGesture({
    onSend: onSendVoice,
  });

  const handleVideoNoteComplete = useCallback(
    async (result: VideoNoteRecordingResult) => {
      setShowVideoNoteRecorder(false);
      await onSendVideoNote?.(result);
    },
    [onSendVideoNote]
  );

  const handleVideoNoteCancel = useCallback(() => {
    setShowVideoNoteRecorder(false);
  }, []);

  const showAttachmentMenu = useCallback(() => {
    const options: string[] = [];
    if (onSendImage) options.push('Photo');
    if (onSendFile) options.push('File');
    if (options.length === 0) return;

    if (Platform.OS === 'ios' && ActionSheetIOS.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options, 'Cancel'],
          cancelButtonIndex: options.length,
        },
        async (buttonIndex) => {
          if (buttonIndex === undefined || buttonIndex === options.length) return;
          const choice = options[buttonIndex];
          if (!choice) return;
          try {
            if (choice === 'Photo' && onSendImage) {
              const result = await ImagePickerService.pickImage({ compress: true });
              if (result) await onSendImage(result);
            } else if (choice === 'File' && onSendFile) {
              const result = await DocumentPickerService.pickDocument();
              if (result) await onSendFile(result);
            }
          } catch (err) {
            if (__DEV__) console.warn('[InputBar] Attachment error:', err);
            Alert.alert('Error', 'Failed to attach. Please try again.');
          }
        }
      );
    } else {
      const buttons = [
        ...options.map((label) => ({
          text: label,
          onPress: async () => {
            try {
              if (label === 'Photo' && onSendImage) {
                const result = await ImagePickerService.pickImage({ compress: true });
                if (result) await onSendImage(result);
              } else if (label === 'File' && onSendFile) {
                const result = await DocumentPickerService.pickDocument();
                if (result) await onSendFile(result);
              }
            } catch (err) {
              if (__DEV__) console.warn('[InputBar] Attachment error:', err);
              Alert.alert('Error', 'Failed to attach. Please try again.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ];
      Alert.alert('Attach', 'Choose attachment type', buttons);
    }
  }, [onSendImage, onSendFile]);

  const showAttachmentButton = onSendImage != null || onSendFile != null;

  return (
    <View style={styles.inputRow}>
      {showAttachmentButton && (
        <Pressable
          style={styles.iconButton}
          onPress={showAttachmentMenu}
          accessibilityRole="button"
          accessibilityLabel="Attach file or photo"
        >
          <Text style={styles.iconText}>{ICON_ATTACH}</Text>
        </Pressable>
      )}
      {onSendVideoNote != null && (
        <Pressable
          style={styles.iconButton}
          onPress={() => setShowVideoNoteRecorder(true)}
          accessibilityRole="button"
          accessibilityLabel="Record video note"
        >
          <Text style={styles.iconText}>{ICON_VIDEO_NOTE}</Text>
        </Pressable>
      )}
      <GestureDetector gesture={voiceGesture}>
        <Pressable style={styles.iconButton}>
          <Text style={styles.iconText}>{ICON_MIC}</Text>
        </Pressable>
      </GestureDetector>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        value={inputText}
        onChangeText={handleInputChange}
        multiline
        maxLength={4096}
      />
      <Pressable
        style={({ pressed }) => [
          styles.sendButton,
          (!inputText.trim() || pressed) && styles.sendButtonDisabled,
        ]}
        onPress={handleSendText}
        disabled={!inputText.trim()}
      >
        <Text
          style={[
            styles.sendText,
            !inputText.trim() && styles.sendTextDisabled,
          ]}
        >
          Send
        </Text>
      </Pressable>
      {onSendVideoNote != null && (
        <VideoNoteRecorder
          visible={showVideoNoteRecorder}
          onComplete={handleVideoNoteComplete}
          onCancel={handleVideoNoteCancel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.chatBackground,
  },
  iconButton: {
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    borderRadius: MIN_TAP_TARGET / 2,
    backgroundColor: colors.buttonBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  input: {
    flex: 1,
    minHeight: MIN_TAP_TARGET,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.inputBackground,
    borderRadius: 20,
    fontSize: typography.messageText,
    lineHeight: typography.messageTextLineHeight,
    color: colors.textPrimary,
  },
  sendButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 20,
  },
  sendButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  sendText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sendTextDisabled: {
    color: colors.placeholder,
  },
});
