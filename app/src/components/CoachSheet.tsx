import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, motion, shadow } from '@/theme/tokens';
import { SUGGESTIONS } from '@/data/content';
import { useGame } from '@/store/useGame';
import { Press } from './Press';
import { Txt, Display } from './Txt';
import { CloseIcon, SendIcon } from './Icons';
import { CoachAvatar } from './CoachAvatar';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

function Dot({ delay, color }: { delay: number; color: string }) {
  const o = useSharedValue(0.25);
  useEffect(() => {
    o.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0.25, { duration: 300 })), -1, false)));
  }, [o, delay]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 9, backgroundColor: color }, st]} />;
}

/** Feuille « Fito, ton coach » : voile + sheet 84 % de l'écran, chat, suggestions, saisie. */
export function CoachSheet() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { coachOpen, closeCoach, chat, typing, draft, setDraft, ask } = useGame();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (coachOpen) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [chat.length, typing, coachOpen]);

  if (!coachOpen) return null;
  const sheetH = Math.round(height * 0.84);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={closeCoach}>
      <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.veil}>
        <Pressable accessibilityLabel="Fermer le coach" onPress={closeCoach} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <Animated.View
          entering={SlideInDown.duration(motion.sheet).easing(ease)}
          exiting={SlideOutDown.duration(280)}
          accessibilityViewIsModal
          style={[styles.sheet, { height: sheetH, backgroundColor: t.bg }, shadow.xl]}
        >
          <View style={styles.grabWrap}>
            <View style={[styles.grab, { backgroundColor: t.track }]} />
          </View>
          <View style={styles.head}>
            <CoachAvatar size={48} radius={16} style={shadow.sm} />
            <View style={{ flex: 1, gap: 1 }}>
              <Display size={20}>Fito</Display>
              <Txt size={12} color={t.ink2}>Ton coach, connaît ton journal et tes objectifs</Txt>
            </View>
            <Press accessibilityLabel="Fermer" onPress={closeCoach} style={[styles.close, { backgroundColor: t.surf }, shadow.sm]}>
              <CloseIcon color={t.ink} />
            </Press>
          </View>

          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.chat} keyboardShouldPersistTaps="handled">
            {chat.map((m, i) => {
              const me = m.from === 'me';
              return (
                <Animated.View
                  key={i}
                  entering={FadeIn.duration(280)}
                  style={[
                    styles.msg,
                    me
                      ? { alignSelf: 'flex-end', backgroundColor: t.strong, borderBottomRightRadius: 6 }
                      : { alignSelf: 'flex-start', backgroundColor: t.surf, borderBottomLeftRadius: 6 },
                    shadow.sm,
                  ]}
                >
                  <Txt size={14} lineHeight={20} color={me ? t.strongInk : t.ink}>{m.text}</Txt>
                </Animated.View>
              );
            })}
            {typing ? (
              <Animated.View entering={FadeIn.duration(280)} accessibilityLabel="Fito écrit" style={[styles.typing, { backgroundColor: t.surf }, shadow.sm]}>
                <Dot delay={0} color={t.ink2} />
                <Dot delay={150} color={t.ink2} />
                <Dot delay={300} color={t.ink2} />
              </Animated.View>
            ) : null}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggRow} contentContainerStyle={styles.sugg} keyboardShouldPersistTaps="handled">
            {SUGGESTIONS.map((q) => (
              <Press key={q} onPress={() => ask(q)} style={[styles.chip, { borderColor: t.line, backgroundColor: t.surf }]}>
                <Txt size={13} weight="semibold">{q}</Txt>
              </Press>
            ))}
          </ScrollView>

          <View style={[styles.inputRow, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
            <TextInput
              accessibilityLabel="Ta question pour Fito"
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => ask(draft)}
              returnKeyType="send"
              placeholder="Pose ta question à Fito"
              placeholderTextColor={t.ink2}
              style={[styles.input, { borderColor: t.line, backgroundColor: t.surf, color: t.ink }]}
            />
            <Press accessibilityLabel="Envoyer" onPress={() => ask(draft)} style={[styles.send, shadow.btn]}>
              <SendIcon color={OBSIDIAN} />
            </Press>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,11,12,0.52)' },
  kav: { flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' },
  sheet: { borderTopLeftRadius: 34, borderTopRightRadius: 34, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  grabWrap: { alignItems: 'center', paddingTop: 8 },
  grab: { width: 38, height: 5, borderRadius: 9, opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  close: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chat: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 8 },
  msg: { maxWidth: '84%', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 13 },
  typing: { alignSelf: 'flex-start', borderRadius: 18, borderBottomLeftRadius: 6, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 4 },
  suggRow: { flexGrow: 0, flexShrink: 0 },
  sugg: { paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  chip: { height: 38, borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  input: { flex: 1, minWidth: 0, height: 50, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, fontSize: 15, fontFamily: 'DMSans_400Regular' },
  send: { width: 50, height: 50, borderRadius: 18, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
});
