import { dayKey, weekDays, weekStart, streak, streakBonus, mealScore, mealReward, activeDaysThisWeek, RULES } from '../src/store/economy';
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } else console.log('ok', m); };
const d = new Date(2026, 9, 2); // vendredi 2 oct 2026
assert(dayKey(d) === '2026-10-02', 'dayKey');
assert(weekStart(d).getDay() === 1 && dayKey(weekStart(d)) === '2026-09-28', 'weekStart = lundi 28 sept');
assert(weekDays(d)[0] === '2026-09-28' && weekDays(d)[6] === '2026-10-04', 'weekDays lun→dim');
const h: any = { '2026-10-02': { challenges: 1, meals: 0, earned: 50 }, '2026-10-01': { challenges: 0, meals: 2, earned: 40 }, '2026-09-30': { challenges: 1, meals: 0, earned: 50 } };
assert(streak(h, d) === 3, 'streak 3 jours consécutifs');
assert(streak({ '2026-10-01': { challenges: 1, meals: 0, earned: 0 } }, d) === 1, 'streak compte hier si aujourd’hui vide');
assert(streak({}, d) === 0, 'streak vide');
assert(streakBonus(2) === 0 && streakBonus(3) === RULES.streakBonus3 && streakBonus(7) === RULES.streakBonus7, 'bonus série');
assert(activeDaysThisWeek(h, d) === 3, 'jours actifs semaine');
assert(mealReward(86) === 300 && mealReward(31) === 100, 'récompense repas');
const good = mealScore(620, 48, 70, 14), junk = mealScore(1080, 34, 128, 46), salad = mealScore(450, 32, 18, 27);
console.log({ good, junk, salad });
assert(good >= 70 && junk < 50 && salad >= 60, 'scores cohérents (bowl > salade > burger)');
console.log('ALL ECONOMY TESTS PASSED');
import { seasonProgress } from '../src/store/economy';
{
  const sp = seasonProgress({ '2026-10-01': { challenges: 1, meals: 2, earned: 1200 }, '2026-10-02': { challenges: 1, meals: 1, earned: 1300 }, '2026-09-30': { challenges: 0, meals: 1, earned: 5000 } }, new Date('2026-10-02T12:00:00'));
  if (sp.earned !== 2500 || sp.tier !== 2 || sp.toNext !== 500 || sp.daysLeft !== 55) throw new Error('season ' + JSON.stringify(sp));
  console.log('ok saison : 2 500 gagnés, palier 2, 500 au suivant, 55 jours');
}
