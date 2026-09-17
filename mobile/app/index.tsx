import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth/AuthContext';

export default function IndexRoute() {
  const { user } = useAuth();

  return <Redirect href={user ? '/home' : '/login'} />;
}
