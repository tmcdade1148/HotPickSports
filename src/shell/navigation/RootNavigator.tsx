import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LoadingScreen} from '@shell/screens/LoadingScreen';
import {SignInScreen} from '@shell/screens/SignInScreen';
import {SignUpScreen} from '@shell/screens/SignUpScreen';
import {HomeScreen} from '@shell/screens/HomeScreen';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Loading"
        screenOptions={{headerShown: false}}>
        <Stack.Screen name="Loading" component={LoadingScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
