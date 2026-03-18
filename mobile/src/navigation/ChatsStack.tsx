import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChatListScreen, ChatScreen } from '../screens';
import type { ChatsStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

export function ChatsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: '#fff',
      }}
    >
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ title: 'Chats' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({
          title: route.params.chatTitle ?? 'Chat',
          headerBackTitle: 'Back',
        })}
      />
    </Stack.Navigator>
  );
}
