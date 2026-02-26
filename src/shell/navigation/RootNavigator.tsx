import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LoadingScreen} from '@shell/screens/LoadingScreen';
import {SignInScreen} from '@shell/screens/SignInScreen';
import {SignUpScreen} from '@shell/screens/SignUpScreen';
import {PoolSelectionScreen} from '@shell/screens/PoolSelectionScreen';
import {CreatePoolScreen} from '@shell/screens/CreatePoolScreen';
import {JoinPoolScreen} from '@shell/screens/JoinPoolScreen';
import {HomeScreen} from '@shell/screens/HomeScreen';
import {ProfileScreen} from '@shell/screens/ProfileScreen';

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
        <Stack.Screen name="PoolSelection" component={PoolSelectionScreen} />
        <Stack.Screen name="CreatePool" component={CreatePoolScreen} />
        <Stack.Screen name="JoinPool" component={JoinPoolScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
