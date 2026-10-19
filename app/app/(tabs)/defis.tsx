import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line, Circle, G } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, shadow } from '@/theme/tokens';
import { CUR_NAMES, OTHER_DEFIS, fmt } from '@/data/content';
import { useSteps } from '@/hooks/useSteps';
import { usePushupCamera } from '@/pose/usePushupCamera';
import { FitaiaPoseView } from '../../modules/fitaia-pose';
import { useEconomy, useGame } from '@/store/useGame';
import { RULES, dayKey, isActiveDay, weekDays } from '@/store/economy';
import { Screen, Card, Row } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CheckIcon, CoinIcon } from '@/components/Icons';

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
  const remainingDays = Math.max(0, RULES.chestActiveDays - eco.activeDays);
  const stepsState = useSteps();
  const completeExtra = useGame((s) => s.completeExtra);
  const cam = usePushupCamera(5);

  const ph = phase === 1;
  const pose = { head: ph ? 176 : 132, shoulder: ph ? 178 : 140, hip: ph ? 190 : 172, elbowX: ph ? 106 : 146, elbowY: ph ? 192 : 172 };
  const fb = fbKind === 'bad' ? { bg: '#3A1714', ink: '#FFB8AF' } : fbKind === 'good' ? { bg: '#22300C', ink: '#D6F57A' } : { bg: '#26282C', ink: '#D4D6DA' };
  const status = running ? (cam.ready ? 'Analyse en direct' : 'Simulation') : pushDone ? 'Terminé' : cam.ready ? 'Caméra prête' : 'Caméra : version App Store';
  const dot = running ? RED : pushDone ? LIME : '#8A8E96';
  const btn = pushDone ? 'Retour à l’accueil' : running ? 'Analyse en cours' : 'Commencer';
  const ok = running || pushDone;
  const bad = fbKind === 'bad';
  const checks: { label: string; state: 'ok' | 'bad' | 'idle' }[] = [
    { label: 'Coudes à 90° en bas', state: bad ? 'bad' : ok ? 'ok' : 'idle' },
    { label: 'Corps gainé et aligné', state: ok ? 'ok' : 'idle' },
    { label: 'Bras tendus en haut', state: ok ? 'ok' : 'idle' },
  ];

  return (
    <Screen name="defis">
      <View accessibilityLabel="Défi pompes" style={[styles.pushCard, shadow.lg]}>
        <View style={styles.cam}>
          {cam.ready && running && FitaiaPoseView ? (
            <FitaiaPoseView active position="back" onPose={cam.onPose} onError={cam.onError} style={StyleSheet.absoluteFill} />
          ) : null}
          {running || pushDone ? (
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
            <Display size={22} color="#F5F4F1">5 pompes</Display>
            <Txt size={14} weight="bold" num color={LIME}>+{RULES.challengeReward} {CUR_NAMES[0]}</Txt>
          </View>
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
            if (pushDone) { router.navigate('/(tabs)'); return; }
            if (cam.ready) cam.begin(); else startPush(() => router.navigate('/(tabs)'));
          }}
          disabled={running}
          style={[styles.startBtn, { backgroundColor: running ? '#5A5D63' : LIME }, shadow.btn]}
        >
          <Txt size={16} weight="bold" color={OBSIDIAN}>{btn}</Txt>
        </Press>
      </View>

      <Row>
        <Txt size={15} weight="bold">Autres défis</Txt>
        <Txt size={12} color={t.ink2}>Nouveaux dans {Math.max(1, 24 - new Date().getHours())} h</Txt>
      </Row>
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
                  <View style={{ height: 4, borderRadius: 9, backgroundColor: t.track }}>
                    <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, borderRadius: 9, backgroundColor: progress >= 1 ? LIME : t.ink }} />
                  </View>
                ) : null}
              </View>
              {action ? (
                <Press haptic="medium" onPress={action} style={styles.validate}>
                  <Txt size={13} weight="bold" color={OBSIDIAN}>{actionLabel}</Txt>
                </Press>
              ) : done ? (
                <View style={[styles.check, { backgroundColor: LIME, width: 24, height: 24, borderRadius: 8 }]}>
                  <CheckIcon size={13} color={OBSIDIAN} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <CoinIcon size={12} />
                  <Txt size={14} weight="bold" num>+{d.reward}</Txt>
                </View>
              )}
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt size={14} weight="bold">Coffre de la semaine</Txt>
          <Txt size={14} num color={t.ink2}>{eco.activeDays} jour{eco.activeDays > 1 ? 's' : ''} sur 7</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => {
            const active = isActiveDay(eco.history[days[i]]);
            const isToday = days[i] === todayK;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{ width: '100%', height: 8, borderRadius: 9, backgroundColor: active ? (eco.chestClaimed ? LIME : t.ink) : t.track, borderWidth: isToday && !active ? 1 : 0, borderColor: t.ink2 }} />
                <Txt size={11} weight={isToday ? 'bold' : 'regular'} color={isToday ? t.ink : t.ink2}>{d}</Txt>
              </View>
            );
          })}
        </View>
        <Txt size={13} color={t.ink2}>
          {eco.chestClaimed
            ? 'Coffre récupéré cette semaine. Nouveau coffre lundi.'
            : remainingDays === 0
              ? 'Coffre débloqué. Il arrive avec ta prochaine action.'
              : 'Encore ' + remainingDays + ' jour' + (remainingDays > 1 ? 's' : '') + ' actif' + (remainingDays > 1 ? 's' : '') + ' pour gagner ' + fmt(RULES.chestReward) + ' ' + CUR_NAMES[0] + ' et une tenue rare mystère.'}
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
