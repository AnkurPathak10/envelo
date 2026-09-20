import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required')
    .max(100, 'Display name is too long'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
type FormValues = z.infer<typeof schema>;
export default function SignupScreen() {
  const { signUp } = useAuth();
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const submit = async (values: FormValues) => {
    try {
      await signUp({
        ...values,
        displayName: values.displayName.trim(),
        email: values.email.trim().toLowerCase(),
      });
    } catch (error) {
      setError('root', {
        message:
          error instanceof ApiError
            ? error.message
            : 'Something went wrong. Please try again.',
      });
    }
  };
  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Start your Envelo conversations.</Text>
      </View>
      <View style={styles.form}>
        <Controller
          control={control}
          name="displayName"
          render={({ field: { onBlur, onChange, value } }) => (
            <View>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                autoComplete="name"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="Your name"
                placeholderTextColor={c.textMuted}
                style={styles.input}
                value={value}
              />
              {errors.displayName && (
                <Text style={styles.error}>{errors.displayName.message}</Text>
              )}
            </View>
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field: { onBlur, onChange, value } }) => (
            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="you@example.com"
                placeholderTextColor={c.textMuted}
                style={styles.input}
                value={value}
              />
              {errors.email && (
                <Text style={styles.error}>{errors.email.message}</Text>
              )}
            </View>
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onBlur, onChange, value } }) => (
            <View>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoComplete="new-password"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="At least 8 characters"
                placeholderTextColor={c.textMuted}
                secureTextEntry
                style={styles.input}
                value={value}
              />
              {errors.password && (
                <Text style={styles.error}>{errors.password.message}</Text>
              )}
            </View>
          )}
        />
        {errors.root && <Text style={styles.error}>{errors.root.message}</Text>}
        <Pressable
          disabled={isSubmitting}
          onPress={handleSubmit(submit)}
          style={styles.button}
        >
          {isSubmitting ? (
            <ActivityIndicator color={c.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </Pressable>
      </View>
      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Log in
      </Link>
    </View>
  );
}
const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: 8,
      minHeight: 48,
      justifyContent: 'center',
      marginTop: 8,
    },
    buttonText: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    container: {
      backgroundColor: c.bgBase,
      flex: 1,
      justifyContent: 'center',
      padding: 24,
    },
    error: { color: c.error, fontSize: 13, marginTop: 6 },
    form: { gap: 18, marginTop: 40 },
    input: {
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: 8,
      borderWidth: 1,
      color: c.textPrimary,
      fontSize: 16,
      marginTop: 8,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    label: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    link: {
      color: c.accentPrimary,
      fontSize: 14,
      marginTop: 28,
      textAlign: 'center',
    },
    subtitle: { color: c.textMuted, fontSize: 16, marginTop: 8 },
    title: { color: c.textPrimary, fontSize: 30, fontWeight: '700' },
  });
