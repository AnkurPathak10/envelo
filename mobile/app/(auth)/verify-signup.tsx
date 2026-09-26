import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, messagingPalette } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { resendSignUpOtp } from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

const palette = {
  background: '#FEFFFE',
  cell: '#F1F0F1',
  cellActive: '#FEE3E2',
  text: colors.light.textPrimary,
  muted: colors.light.textMuted,
  border: '#E3C4C9',
  brand: messagingPalette.rosyTaupe,
  brandDeep: '#480200',
  error: colors.light.error,
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function secondsRemaining(timestamp: string): number {
  const milliseconds = Date.parse(timestamp) - Date.now();
  return Number.isFinite(milliseconds)
    ? Math.max(0, Math.ceil(milliseconds / 1000))
    : 0;
}

export default function VerifySignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    challengeId?: string | string[];
    emailMasked?: string | string[];
    expiresAt?: string | string[];
    resendAvailableAt?: string | string[];
  }>();
  const systemScheme = useAppColorScheme();
  const { verifySignUpOtp } = useAuth();
  const inputRef = useRef<TextInput>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardVisibleRef = useRef(false);
  const [challengeId, setChallengeId] = useState(() =>
    firstParam(params.challengeId)
  );
  const [emailMasked, setEmailMasked] = useState(() =>
    firstParam(params.emailMasked)
  );
  const [expiresAt, setExpiresAt] = useState(() =>
    firstParam(params.expiresAt)
  );
  const [resendAvailableAt, setResendAvailableAt] = useState(() =>
    firstParam(params.resendAvailableAt)
  );
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(() =>
    secondsRemaining(firstParam(params.resendAvailableAt))
  );

  const hasChallenge = Boolean(challengeId && emailMasked && expiresAt);
  const digits = useMemo(
    () => Array.from({ length: 6 }, (_, index) => code[index] ?? ''),
    [code]
  );

  const focusCodeInput = useCallback(() => {
    if (keyboardVisibleRef.current) {
      inputRef.current?.focus();
      return;
    }
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);

    // Android can keep the TextInput focused after the user dismisses the
    // keyboard. Calling focus() again is then a no-op, so force a short
    // blur/focus cycle whenever the visible OTP cells are tapped.
    inputRef.current?.blur();
    focusTimerRef.current = setTimeout(
      () => {
        inputRef.current?.focus();
        focusTimerRef.current = null;
      },
      Platform.OS === 'android' ? 60 : 0
    );
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.background);
    return () => {
      void SystemUI.setBackgroundColorAsync(colors[systemScheme].bgBase);
    };
  }, [systemScheme]);

  useEffect(() => {
    if (!hasChallenge) router.replace('/(auth)/signup');
  }, [hasChallenge, router]);

  useEffect(() => {
    const updateCountdown = () =>
      setCountdown(secondsRemaining(resendAvailableAt));
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  const changeCode = (value: string) => {
    setError(null);
    setCode(value.replace(/\D/g, '').slice(0, 6));
  };

  const verify = async () => {
    if (code.length !== 6 || isVerifying) return;
    setError(null);
    setIsVerifying(true);
    try {
      await verifySignUpOtp({ challengeId, code });
      router.replace('/(app)/home');
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to verify this code. Please try again.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const resend = async () => {
    if (countdown > 0 || isResending) return;
    setError(null);
    setIsResending(true);
    try {
      const challenge = await resendSignUpOtp(challengeId);
      setChallengeId(challenge.challengeId);
      setEmailMasked(challenge.emailMasked);
      setExpiresAt(challenge.expiresAt);
      setResendAvailableAt(challenge.resendAvailableAt);
      setCode('');
      focusCodeInput();
    } catch (caught: unknown) {
      if (
        caught instanceof ApiError &&
        caught.status === 429 &&
        caught.retryAfterSeconds
      ) {
        setCountdown(caught.retryAfterSeconds);
        setResendAvailableAt(
          new Date(Date.now() + caught.retryAfterSeconds * 1000).toISOString()
        );
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to resend the code. Please try again.'
      );
    } finally {
      setIsResending(false);
    }
  };

  const returnToSignup = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(auth)/signup');
  };

  if (!hasChallenge) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" backgroundColor={palette.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Pressable
            accessibilityLabel="Back to signup"
            accessibilityRole="button"
            hitSlop={12}
            onPress={returnToSignup}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={palette.text} name="chevron-back" size={23} />
          </Pressable>

          <Text style={styles.title}>Verify account</Text>
          <Text style={styles.description}>
            We sent a six-digit verification code to{' '}
            <Text style={styles.email}>{emailMasked}</Text>. Please check your
            email and enter the code below.
          </Text>

          <Pressable
            accessibilityRole="none"
            onPress={focusCodeInput}
            style={styles.codeRow}
          >
            {digits.map((digit, index) => (
              <View
                key={index}
                style={[
                  styles.codeCell,
                  index === code.length &&
                    code.length < 6 &&
                    styles.codeCellActive,
                ]}
              >
                <Text style={styles.codeDigit}>{digit}</Text>
              </View>
            ))}
            <TextInput
              ref={inputRef}
              accessibilityLabel="Six-digit verification code"
              autoComplete="one-time-code"
              autoFocus
              caretHidden
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={changeCode}
              selectionColor={palette.brand}
              style={styles.hiddenInput}
              textContentType="oneTimeCode"
              value={code}
            />
          </Pressable>

          <Text style={styles.expiry}>The code expires in 10 minutes.</Text>

          <View style={styles.resendRow}>
            <Text style={styles.muted}>Didn&apos;t get the code? </Text>
            <Pressable
              accessibilityRole="button"
              disabled={countdown > 0 || isResending}
              onPress={resend}
            >
              <Text
                style={[
                  styles.inlineAction,
                  (countdown > 0 || isResending) && styles.inlineActionDisabled,
                ]}
              >
                {isResending
                  ? 'Sending…'
                  : countdown > 0
                    ? `Resend in ${countdown}s`
                    : 'Resend code'}
              </Text>
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" onPress={returnToSignup}>
            <Text style={styles.notYourEmail}>Not your email?</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              disabled={code.length !== 6 || isVerifying}
              onPress={verify}
              style={({ pressed }) => [
                styles.continueButton,
                (code.length !== 6 || isVerifying) &&
                  styles.continueButtonDisabled,
                pressed && code.length === 6 && !isVerifying && styles.pressed,
              ]}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.continueText}>Continue</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: palette.cell,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginBottom: 28,
    width: 36,
  },
  codeCell: {
    alignItems: 'center',
    backgroundColor: palette.cell,
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1.5,
    flex: 1,
    height: 58,
    justifyContent: 'center',
    maxWidth: 52,
  },
  codeCellActive: {
    backgroundColor: palette.cellActive,
    borderColor: palette.brand,
  },
  codeDigit: { color: palette.text, fontSize: 22, fontWeight: '700' },
  codeRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 32,
    maxWidth: 352,
    position: 'relative',
    width: '100%',
  },
  content: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 520,
    paddingHorizontal: 24,
    paddingTop: 12,
    width: '100%',
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: palette.brand,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
  },
  continueButtonDisabled: { opacity: 0.38 },
  continueText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  description: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  email: { color: palette.text, fontWeight: '700' },
  error: {
    color: palette.error,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 20,
    textAlign: 'center',
  },
  expiry: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  footer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 20 },
  hiddenInput: {
    height: 1,
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  inlineAction: { color: palette.brandDeep, fontSize: 14, fontWeight: '700' },
  inlineActionDisabled: { color: palette.muted, fontWeight: '600' },
  keyboardView: { flex: 1 },
  muted: { color: palette.muted, fontSize: 14 },
  notYourEmail: {
    color: palette.brandDeep,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 18,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  pressed: { opacity: 0.72 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  screen: { backgroundColor: palette.background, flex: 1 },
  title: { color: palette.text, fontSize: 28, fontWeight: '800' },
});
