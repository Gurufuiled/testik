import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

type Props = {
  onLogin: () => void;
};

export function AuthStack({ onLogin }: Props) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login">
        {() => <LoginScreen onLogin={onLogin} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
