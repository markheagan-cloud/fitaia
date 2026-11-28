import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line, Circle, G } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, shadow, screenAccent } from '@/theme/tokens';
import { CUR_NAMES, OTHER_DEFIS, fmt } from '@/data/content';
import { useSteps } from '@/hooks/useSteps';
import { challengeTarget as poseTarget, nextRaise } from '@/coach/challengeTarget';
import { usePushupCamera } from '@/pose/usePushupCamera';
import { PushupLive } from '@/pose/PushupLive';
import { FitaiaPoseView } from '../../modules/fitaia-pose';
import { useEconomy, useGame } from '@/store/useGame';
import { useDailyCoins, useEco } from '@/store/useEco';
import { PROGRESSION_RULES } from '@/progression/progressionRules';

const PF_CHALLENGE = PROGRESSION_RULES.challenge_completed.points;
import { RULES, dayKey, isActiveDay, weekDays } from '@/store/economy';
import { Screen, Card } from '@/components/Screen';
import { FillBar, SectionTitle } from '@/ui/kit';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CheckIcon } from '@/components/Icons';

const PANEL_W = 342;
const PANEL_H = 236;

export default function Defis() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const panelW = Math.max(0, width - 32 - 16); // carte 8px de padding de chaque côté
  const { reps, running, pushDone, feedback, fbKind, phase, startPush } = useGame();
  const eco = useEconomy();
  const days = weekDays();
  const todayK = dayKey();
  const dailyCoins = useDailyCoins('daily_challenge');
  const weeklyPoints = useEco((s) => s.account?.weeklyPoints ?? 0);
  const stepsState = useSteps();
  const completeExtra = useGame((s) => s.completeExtra);
  const history = useGame((x) => x.history);
  // cible du jour : monte toute seule avec les jours réussis ; sans caméra (démonstration) elle reste à 5
  const target = poseTarget(history);
  const cam = usePushupCamera(target);

  const ph = phase === 1;
  const pose = { head: ph ? 176 : 132, shoulder: ph ? 178 : 140, hip: ph ? 190 : 172, elbowX: ph ? 106 : 146, elbowY: ph ? 192 : 172 };
  const fb = fbKind === 'bad' ? { bg: '#3A1714', ink: '#FFB8AF' } : fbKind === 'good' ? { bg: '#22300C', ink: '#D6F57A' } : { bg: '#26282C', ink: '#D4D6DA' };
  const live = cam.ready && running;
  // caméra en direct : plein écran (PushupLive), la carte garde sa taille
  const camH = PANEL_H;
  const placing = live && cam.placement !== 'ready';
  const status = live ? (cam.placement === 'ready' ? 'Bien placé · je compte' : cam.placement === 'partial' ? 'Place-toi en entier' : 'Je te cherche…') : running ? 'Simulation' : pushDone ? 'Terminé' : cam.ready ? 'Caméra prête' : 'Caméra : version App Store';
  const dot = running ? RED : pushDone ? LIME : '#8A8E96';
  const btn = pushDone ? 'Retour à l’accueil' : running ? 'Analyse en cours' : 'Commencer';
  const ok = running || pushDone;
  const bad = fbKind === 'bad' && !placing;
  const checks: { label: string; state: 'ok' | 'bad' | 'idle' }[] = [
    { label: 'Coudes à 90° en bas', state: bad ? 'bad' : ok && !placing ? 'ok' : 'idle' },
    { label: 'Corps gainé et aligné', state: ok && !placing ? 'ok' : 'idle' },
    { label: 'Bras tendus en haut', state: ok && !placing ? 'ok' : 'idle' },
  ];

  return (
    <Screen name="defis">
      <View accessibilityLabel="Défi pompes" style={[styles.pushCard, shadow.lg]}>
        <View style={[styles.cam, { height: camH }]}>
          {live && FitaiaPoseView ? (
            <PushupLive
              reps={reps}
              target={target}
              feedback={feedback}
              fbKind={fbKind}
              placement={cam.placement}
              lastPose={cam.lastPose}
              onPose={cam.onPose}
              onError={cam.onError}
              onStop={cam.abort}
            />
          ) : null}
          {(running || pushDone) && !live ? (
          <Svg width={panelW} height={PANEL_H} viewBox={`0 0 ${PANEL_W} ${PANEL_H}`} preserveAspectRatio="xMidYMid meet" style={StyleSheet.absoluteFill}>
            <Line x1={30} y1={206} x2={312} y2={206} stroke="#34373C" strokeWidth={2} />
            <G stroke={LIME} strokeWidth={4} strokeLinecap="round" opacity={cam.ready && running ? 0 : 1}>
              <Line x1={86} y1={pose.head} x2={146} y2={pose.shoulder} />
              <Line x1={146} y1={pose.shoulder} x2={266} y2={pose.hip} />
              <Line x1={266} y1={pose.hip} x2={298} y2={202} />
              <Line x1={146} y1={pose.shoulder} x2={pose.elbowX} y2={pose.elbowY} />
              <Line x1={pose.elbowX} y1={pose.elbowY} x2={146} y2={202} />
            </G>
            <G fill="#F5F4F1" opacity={cam.ready && running ? 0 : 1}>
              <Circle cx={86} cy={pose.head} r={7} />
              <Circle cx={146} cy={pose.shoulder} r={5} />
              <Circle cx={pose.elbowX} cy={pose.elbowY} r={5} />
              <Circle cx={146} cy={202} r={5} />
              <Circle cx={266} cy={pose.hip} r={5} />
              <Circle cx={298} cy={202} r={5} />
            </G>
          </Svg>
          ) : null}
          <View style={styles.status}>
            <View style={{ width: 7, height: 7, borderRadius: 9, backgroundColor: dot }} />
            <Txt size={12} color="#B7BBC2">{status}</Txt>
          </View>
          <View style={styles.reps}>
            {running || pushDone ? (
              <Display wide size={64} num lineHeight={64} letterSpacing={-3.8} color="#F5F4F1">
                {reps}
                <Display wide size={24} color="#6E727A" letterSpacing={-0.5}>/5</Display>
              </Display>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Display wide size={64} num lineHeight={64} letterSpacing={-3.8} color="#F5F4F1">5</Display>
                <Txt size={12} weight="semibold" color="#B7BBC2">pompes à faire</Txt>
              </View>
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 8, paddingTop: 4, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Display size={22} color="#F5F4F1">{(cam.ready ? target : 5) + ' pompes'}</Display>
            <Txt size={14} weight="bold" num color={LIME}>{dailyCoins ? '+' + dailyCoins + ' ' + CUR_NAMES[0] : '+' + PF_CHALLENGE + ' PF'}</Txt>
          </View>
          {cam.ready && !running && !pushDone ? <Txt size={12} color="#9EA2AA">{nextRaise(history)}</Txt> : null}
          <View accessibilityRole="text" accessibilityLiveRegion="polite" style={[styles.fb, { backgroundColor: fb.bg }]}>
            <Txt size={13} weight="semibold" lineHeight={18} color={fb.ink}>{feedback}</Txt>
          </View>
          <View style={{ gap: 6, paddingHorizontal: 2 }}>
            {checks.map((c) => (
              <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.check, { backgroundColor: c.state === 'ok' ? LIME : c.state === 'bad' ? RED : '#34373C' }]}>
                  <CheckIcon color={c.state === 'idle' ? '#6E727A' : OBSIDIAN} cross={c.state === 'bad'} />
                </View>
                <Txt size={13} color="#D4D6DA">{c.label}</Txt>
              </View>
            ))}
          </View>
        </View>

        <Press
          haptic="medium"
          onPress={() => {
            if (running) { cam.abort(); return; }
            if (pushDone) { router.navigate('/(tabs)'); return; }
            if (cam.ready) cam.begin(); else startPush(() => router.navigate('/(tabs)'));
          }}
          accessibilityLabel={running ? 'Arrêter le défi' : btn}
          style={[styles.startBtn, { backgroundColor: running ? '#5A5D63' : LIME }, shadow.btn]}
        >
          <Txt size={16} weight="bold" color={running ? '#F5F4F1' : OBSIDIAN}>{running ? 'Arrêter' : btn}</Txt>
        </Press>
      </View>

      <SectionTitle title="Missions bonus" hint={eco.doneToday.length + ' / ' + OTHER_DEFIS.length + ' · nouvelles dans ' + Math.max(1, 24 - new Date().getHours()) + ' h'} />
      <Card style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
        {OTHER_DEFIS.map((d, i) => {
          const done = eco.doneToday.indexOf(d.id) >= 0;
          let progress = 0;
          let subText = d.sub;
          let action: (() => void) | null = null;
          let actionLabel = '';
          if (d.kind === 'meals') {
            progress = Math.min(1, eco.today.meals / d.target);
            subText = done ? 'Validé aujourd’hui' : Math.min(eco.today.meals, d.target) + ' sur ' + d.target + ' repas ajoutés';
          } else if (d.kind === 'steps') {
            if (stepsState.available === false) subText = stepsState.error ?? d.sub;
            else if (stepsState.available === null) subText = 'Lecture du podomètre…';
            else {
              progress = Math.min(1, stepsState.steps / d.target);
              subText = done ? 'Validé aujourd’hui' : fmt(stepsState.steps) + ' sur ' + fmt(d.target) + ' pas';
              if (!done && stepsState.steps >= d.target) {
                action = () => completeExtra(d.id);
                actionLabel = 'Valider';
              }
            }
          } else {
            subText = d.sub + ' · dans la version App Store';
          }
          return (
            <View key={d.id} style={[styles.defiRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.line }, d.kind === 'camera' && { opacity: 0.6 }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt size={15} weight="semibold">{d.name}</Txt>
                <Txt size={12} color={done ? (t.dark ? LIME : '#3F5600') : t.ink2}>{subText}</Txt>
                {d.kind !== 'camera' && !done ? (
                  <FillBar pct={progress} height={4} color={progress >= 1 ? LIME : t.ink} />
                ) : null}
              </View>
              {action ? (
                <Press haptic="medium" onPress={action} style={styles.validate}>
                  <Txt size={13} weight="bold" color={OBSIDIAN}>{actionLabel}</Txt>
                </Press>
              ) : done ? (
                <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.check, { backgroundColor: LIME, width: 26, height: 26, borderRadius: 13 }]}>
                  <CheckIcon size={13} color={OBSIDIAN} />
                </Animated.View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Txt size={14} weight="bold" num>+{d.points} PF</Txt>
                </View>
              )}
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt size={16} weight="bold" color={screenAccent(t, 'defis')}>Régularité</Txt>
          <Txt size={14} num color={t.ink2}>{eco.activeDays} jour{eco.activeDays > 1 ? 's' : ''} sur 7</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => {
            const active = isActiveDay(eco.history[days[i]]);
            const isToday = days[i] === todayK;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{ width: '100%', height: 8, borderRadius: 9, backgroundColor: active ? LIME : t.track, borderWidth: isToday && !active ? 1 : 0, borderColor: t.ink2 }} />
                <Txt size={11} weight={isToday ? 'bold' : 'regular'} color={isToday ? t.ink : t.ink2}>{d}</Txt>
              </View>
            );
          })}
        </View>
        <Txt size={13} color={t.ink2}>
          {fmt(weeklyPoints) + ' Points FITAIA cette semaine. Un défi rapporte ' + PF_CHALLENGE + ' PF, un repas enregistré ' + PROGRESSION_RULES.meal_logged.points + ' PF.'}
        </Txt>
        <Txt size={12} lineHeight={17} color={t.ink2}>
          Un jour sans défi ne casse rien : la semaine compte tes jours actifs. Le repos et le sommeil comptent aussi pour ta forme.
        </Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pushCard: { backgroundColor: OBSIDIAN, borderRadius: 30, padding: 8, gap: 8 },
  cam: { height: PANEL_H, borderRadius: 24, backgroundColor: '#26282C', overflow: 'hidden' },
  status: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(28,29,31,0.7)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  reps: { position: 'absolute', right: 16, top: 8 },
  fb: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  check: { width: 18, height: 18, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  startBtn: { height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  defiRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  validate: { height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
});
