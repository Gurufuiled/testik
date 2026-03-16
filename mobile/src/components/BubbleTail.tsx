/**
 * BubbleTail - Small triangle at bubble corner (Telegram-style).
 * Renders at bottom-right (mine) or bottom-left (other).
 * Uses border trick: width/height 0, transparent sides to form triangle.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

const TAIL_SIZE = 8;

interface BubbleTailProps {
  isMe: boolean;
  color: string;
}

export function BubbleTail({ isMe, color }: BubbleTailProps) {
  return (
    <View
      style={[
        styles.tail,
        isMe ? styles.tailMe : styles.tailOther,
        isMe ? { borderRightColor: color } : { borderLeftColor: color },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  tail: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderTopWidth: TAIL_SIZE,
    borderTopColor: 'transparent',
    borderBottomWidth: 0,
    borderLeftWidth: TAIL_SIZE,
    borderRightWidth: TAIL_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tailMe: {
    right: 0,
  },
  tailOther: {
    left: 0,
  },
});
