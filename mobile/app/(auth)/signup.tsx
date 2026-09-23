import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LottieView from 'lottie-react-native';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { authColors as c } from '@/constants/theme';

// Keep the animation data local so it is available before authentication.
const AUTH_HERO_ANIMATION = require('../../assets/hi-girl-auth.json');

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
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    defaultValues: { displayName: '', email: '', password: '' },
    resolver: zodResolver(schema),
  });
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
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandSection}>
            <View style={styles.headerTopRow}>
              <Text style={styles.brandName}>Envelo</Text>
            </View>
            <View style={styles.heroRow}>
              <View pointerEvents="none" style={styles.decorativeCopy}>
                <View style={styles.decorativeFirstLine}>
                  <Text style={styles.decorativeText}>Create</Text>
                  <View style={styles.markerStroke} />
                </View>
                <Text style={[styles.decorativeText, styles.decorativeSecondLine]}>
                  account
                </Text>
              </View>
              <View pointerEvents="none" style={styles.animationWrap}>
                <LottieView
                  autoPlay
                  loop
                  source={AUTH_HERO_ANIMATION}
                  style={styles.animation}
                  webStyle={{ height: '100%', width: '100%' }}
                />
              </View>
            </View>
          </View>

          <View style={styles.panel}>
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
                      <Text style={styles.error}>
                        {errors.displayName.message}
                      </Text>
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
                      <Text style={styles.error}>
                        {errors.password.message}
                      </Text>
                    )}
                  </View>
                )}
              />
              {errors.root && (
                <Text style={styles.error}>{errors.root.message}</Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={handleSubmit(submit)}
                style={({ pressed }) => [
                  styles.button,
                  isSubmitting && styles.buttonDisabled,
                  pressed && !isSubmitting && styles.buttonPressed,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={c.textOnBrand} />
                ) : (
                  <Text style={styles.buttonText}>Create account</Text>
                )}
              </Pressable>
            </View>
            <Link href="/(auth)/login" style={styles.link}>
              Already have an account? Log in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  animation: { height: '100%', width: '100%' },
  animationWrap: {
    bottom: -38,
    height: 380,
    maxWidth: 390,
    position: 'absolute',
    right: -48,
    width: '100%',
    zIndex: 1,
  },
  brandName: {
    color: c.textOnBrand,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  brandSection: {
    backgroundColor: c.brandDeep,
    minHeight: 340,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  button: {
    alignItems: 'center',
    backgroundColor: c.brandPrimary,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: c.textOnBrand, fontSize: 16, fontWeight: '700' },
  decorativeCopy: {
    left: 10,
    position: 'absolute',
    top: -5,
    transform: [{ rotate: '-9deg' }],
    zIndex: 2,
  },
  decorativeFirstLine: { position: 'relative' },
  decorativeSecondLine: {
    fontSize: 35,
    marginLeft: 14,
    marginTop: -7,
  },
  decorativeText: {
    color: c.textOnBrand,
    fontFamily: 'ShadowsIntoLight_400Regular',
    fontSize: 35,
    lineHeight: 45,
  },
  error: { color: c.error, fontSize: 13, marginTop: 6 },
  form: { gap: 16 },
  headerTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  heroRow: {
    flex: 1,
    position: 'relative',
  },
  input: {
    backgroundColor: c.input,
    borderColor: c.brandSoft,
    borderRadius: 14,
    borderWidth: 1,
    color: c.textPrimary,
    fontSize: 16,
    marginTop: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  keyboardView: { flex: 1 },
  label: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
  link: {
    color: c.brandDeep,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
  },
  markerStroke: {
    backgroundColor: '#FFB23E',
    borderRadius: 999,
    bottom: 3,
    height: 3,
    left: 2,
    opacity: 0.95,
    position: 'absolute',
    transform: [{ rotate: '-3deg' }],
    width: 68,
  },
  panel: {
    backgroundColor: c.panel,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    flexGrow: 1,
    marginTop: -38,
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  screen: { backgroundColor: c.brandDeep, flex: 1 },
  scrollContent: { flexGrow: 1 },
});
