/**
 * Large, realistic DEMO dataset for development / testing only.
 *
 *   ALLOW_DEMO_SEED=true npm run seed:demo
 *
 * Safety (all checked before anything is written; nothing is ever deleted):
 *   - requires ALLOW_DEMO_SEED=true (explicit opt-in);
 *   - refuses when NODE_ENV=production;
 *   - refuses a non-local database host unless DEMO_SEED_ALLOW_REMOTE_DB=true;
 *   - refuses a database that already has trips / pilgrims / payments /
 *     expenses / adjustments or non-system delegates, so running it twice can
 *     never create duplicates or touch real data;
 *   - requires the base seed (`npm run seed`) users and system delegate.
 *
 * Deterministic: a fixed-seed PRNG and fixed calendar dates (anchored to
 * 2026-10-18), so every fresh run produces the same data.
 *
 * Bulk rows are inserted in ONE transaction. Exceptional actions (payment
 * voids, refunds, corrections, expense voids) then go through the real
 * services so their business rules and audit logs apply.
 *
 * Files: four small sample images are written once; every document / receipt
 * / invoice row gets its own HARD LINK to the matching sample. Each row has a
 * unique, valid storage key (view / replace / delete work independently and
 * nothing is broken) while the disk holds only four images.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { AdjustmentDirection, ExpenseCategory, Prisma, Role } from '@prisma/client';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import { SYSTEM_DELEGATE_NAME } from '../src/config/app';
import { UPLOADS_ROOT, safeResolve } from '../src/modules/documents/storage';
import { receiptKey } from '../src/utils/receiptNumber';
import { getDelegateAccounts } from '../src/services/delegateAccount.service';
import { createCorrection, createRefund, voidPayment } from '../src/services/payment.service';
import { voidExpense } from '../src/services/expense.service';

// ---------------------------------------------------------------- guards

const refuse = (message: string): never => {
  console.error(`\n✖ demo seed refused: ${message}\n`);
  process.exit(1);
};

const guard = async () => {
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    refuse('set ALLOW_DEMO_SEED=true to confirm you want the large demo dataset (development only).');
  }
  if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
    refuse('NODE_ENV is production. The demo dataset must never be loaded into production.');
  }
  const host = new URL(process.env.DATABASE_URL ?? '').hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) && process.env.DEMO_SEED_ALLOW_REMOTE_DB !== 'true') {
    refuse(`database host "${host}" is not local. Set DEMO_SEED_ALLOW_REMOTE_DB=true only for a disposable remote dev database.`);
  }
  const [trips, pilgrims, payments, expenses, adjustments, delegates] = await Promise.all([
    prisma.trip.count(),
    prisma.pilgrim.count(),
    prisma.payment.count(),
    prisma.expense.count(),
    prisma.financialAdjustment.count(),
    prisma.delegate.count({ where: { isSystem: false } }),
  ]);
  if (trips + pilgrims + payments + expenses + adjustments + delegates > 0) {
    refuse(
      `the database already contains data (trips ${trips}, pilgrims ${pilgrims}, payments ${payments}, expenses ${expenses}, delegates ${delegates}). ` +
        'The demo seed only fills an EMPTY database and never deletes anything. Use a fresh database (e.g. `npx prisma migrate reset` on a disposable dev database, then `npm run seed`).',
    );
  }
  const [manager, employee, systemDelegate] = await Promise.all([
    prisma.user.findFirst({ where: { role: Role.MANAGER, isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.user.findFirst({ where: { role: Role.EMPLOYEE, isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.delegate.findFirst({ where: { isSystem: true } }),
  ]);
  if (!manager || !employee || !systemDelegate) {
    refuse('run the base seed first (`npm run seed`) — it creates the manager, the employee and the system delegate.');
  }
  return { manager: manager!, employee: employee!, systemDelegate: systemDelegate! };
};

// ---------------------------------------------------------------- deterministic helpers

let state = 20261018;
const rand = (): number => {
  // mulberry32
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const chance = (p: number) => rand() < p;
const shuffle = <T>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

const ANCHOR = new Date(Date.UTC(2026, 9, 18)); // 2026-10-18
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const atHour = (date: Date, hour: number, minute = 0) => new Date(date.getTime() + (hour * 60 + minute) * 60_000);
const minDate = (a: Date, b: Date) => (a < b ? a : b);
const money = (pounds: number) => `${pounds}.00`; // whole pounds only: exact, no floating point

// ---------------------------------------------------------------- sample files (hard links)

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** Small valid PNG: a tinted card with a darker header band. */
const samplePng = (rgb: [number, number, number], width = 360, height = 240): Buffer => {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const band = y < 48 ? 0.75 : 1;
      const edge = x < 6 || x >= width - 6 || y >= height - 6 ? 0.85 : 1;
      row[1 + x * 3] = Math.round(rgb[0] * band * edge);
      row[2 + x * 3] = Math.round(rgb[1] * band * edge);
      row[3 + x * 3] = Math.round(rgb[2] * band * edge);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const SAMPLES = {
  passport: samplePng([196, 214, 236]),
  photo: samplePng([236, 222, 200], 240, 300),
  receipt: samplePng([222, 236, 214]),
  invoice: samplePng([236, 214, 222]),
};
const samplePaths: Record<keyof typeof SAMPLES, string> = {} as never;
const writeSamples = () => {
  const dir = safeResolve('demo-samples');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, buffer] of Object.entries(SAMPLES)) {
    const file = path.join(dir, `${name}.png`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, buffer);
    samplePaths[name as keyof typeof SAMPLES] = file;
  }
};
const linkedFiles: string[] = [];
/** Creates the stored file for one row: a hard link (falls back to a copy). */
const linkSample = (sample: keyof typeof SAMPLES, storageKey: string) => {
  const target = safeResolve(storageKey);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.linkSync(samplePaths[sample], target);
  } catch {
    fs.copyFileSync(samplePaths[sample], target);
  }
  linkedFiles.push(target);
  return { sizeBytes: SAMPLES[sample].length };
};

// ---------------------------------------------------------------- reference data (fictional)

const DELEGATE_NAMES_GIVEN = [
  'حسام سرحان',
  'هانى مسعد',
  'عادل بريك',
  'خالد عبد العاطى',
  'سامح ياسين',
  'باسم القاضى',
  'احمد شاهين',
  'احمد عطية',
  'مصطفى ابو سليمان',
  'بلال الشيخ',
  'محمد عامر',
  'محمد عطية',
];
const DELEGATE_NAMES_GENERATED = [
  'طارق عبد الحميد',
  'ياسر الجندى',
  'شريف منصور',
  'وليد السيد',
  'عمرو فتحى',
  'محمود الشافعى',
  'أيمن رشاد',
  'رامى عبد الله',
  'إبراهيم النجار',
  'سعيد البحيرى',
  'ناصر حسنين',
  'عصام زكى',
  'جمال الدسوقى',
  'أسامة عبد الرحيم',
  'محمد الفقى',
  'كريم شلبى',
  'حمدى الصاوى',
  'عبد الرحمن قنديل',
];

const MALE = ['محمد', 'أحمد', 'محمود', 'مصطفى', 'إبراهيم', 'علي', 'حسن', 'حسين', 'عبد الله', 'عبد الرحمن', 'خالد', 'سيد', 'عمر', 'يوسف', 'سامي', 'جمال', 'عادل', 'صلاح', 'رجب', 'شعبان', 'فتحي', 'عبد العزيز', 'عبد الحميد', 'السيد', 'أشرف', 'هشام', 'طارق', 'ماهر', 'رضا', 'سعد', 'كمال', 'نبيل', 'عاطف', 'ممدوح', 'عبد الفتاح', 'منصور', 'حامد', 'زكريا', 'عزت', 'فوزي'];
const FEMALE = ['فاطمة', 'زينب', 'خديجة', 'عائشة', 'مريم', 'سعاد', 'نادية', 'هدى', 'سميرة', 'أمينة', 'نجلاء', 'صفاء', 'منى', 'هالة', 'إيمان', 'رشا', 'سحر', 'عفاف', 'كريمة', 'ليلى', 'نعمات', 'وفاء', 'سهير', 'إنشراح', 'حنان'];
const FAMILY = ['عبد السلام', 'الشربيني', 'المصري', 'عبد الغني', 'حسانين', 'السيد', 'البدوي', 'رمضان', 'شحاتة', 'عبد اللطيف', 'الفخراني', 'النمر', 'عوض', 'سليمان', 'إسماعيل', 'العشري', 'جاد', 'عبد المقصود', 'خليل', 'الطنطاوي', 'مرسي', 'الحسيني', 'زيدان', 'عبد الهادي', 'غنيم', 'سالم', 'هيكل', 'عبد الجواد', 'القاضي', 'فرج'];
const JOBS_M = ['موظف', 'مدرس', 'مهندس', 'محاسب', 'مزارع', 'تاجر', 'سائق', 'طبيب', 'عامل', 'متقاعد', 'موظف بالمعاش', 'صاحب محل', 'فني كهرباء', 'محامي', 'صيدلي'];
const JOBS_F = ['ربة منزل', 'ربة منزل', 'ربة منزل', 'مدرسة', 'موظفة', 'متقاعدة', 'طبيبة', 'محاسبة'];
const GOVERNORATES: Array<{ name: string; code: string; cities: string[] }> = [
  { name: 'القاهرة', code: '01', cities: ['مدينة نصر', 'شبرا', 'المعادي', 'حلوان', 'عين شمس', 'المطرية'] },
  { name: 'الإسكندرية', code: '02', cities: ['سيدي بشر', 'المنتزه', 'محرم بك', 'العجمي'] },
  { name: 'الجيزة', code: '21', cities: ['الدقي', 'فيصل', 'الهرم', '6 أكتوبر', 'إمبابة', 'البدرشين'] },
  { name: 'القليوبية', code: '14', cities: ['بنها', 'شبرا الخيمة', 'قليوب', 'طوخ'] },
  { name: 'الشرقية', code: '13', cities: ['الزقازيق', 'بلبيس', 'منيا القمح', 'فاقوس', 'أبو حماد'] },
  { name: 'الدقهلية', code: '12', cities: ['المنصورة', 'ميت غمر', 'طلخا', 'السنبلاوين'] },
  { name: 'الغربية', code: '16', cities: ['طنطا', 'المحلة الكبرى', 'زفتى', 'كفر الزيات'] },
  { name: 'المنوفية', code: '17', cities: ['شبين الكوم', 'منوف', 'أشمون', 'تلا'] },
  { name: 'البحيرة', code: '18', cities: ['دمنهور', 'كفر الدوار', 'إيتاي البارود'] },
  { name: 'كفر الشيخ', code: '15', cities: ['كفر الشيخ', 'دسوق', 'بيلا'] },
  { name: 'الفيوم', code: '23', cities: ['الفيوم', 'إطسا', 'سنورس'] },
  { name: 'بني سويف', code: '22', cities: ['بني سويف', 'الواسطى', 'ببا'] },
  { name: 'المنيا', code: '24', cities: ['المنيا', 'ملوي', 'سمالوط', 'مغاغة'] },
  { name: 'أسيوط', code: '25', cities: ['أسيوط', 'ديروط', 'منفلوط'] },
  { name: 'سوهاج', code: '26', cities: ['سوهاج', 'طهطا', 'جرجا', 'أخميم'] },
];
const STREETS = ['ش الجمهورية', 'ش التحرير', 'ش 23 يوليو', 'ش الجلاء', 'ش بورسعيد', 'ش المحطة', 'ش الثورة', 'ش الجيش', 'ش سعد زغلول', 'ش المدارس', 'ش الجامع'];
const NOTES = ['أول عمرة', 'يحتاج كرسي متحرك في المطار', 'مرافق لوالدته', 'غرفة ثلاثية مع الأسرة', 'كبير في السن — يحتاج متابعة', 'يفضل الطابق الأرضي', 'نظام غذائي خاص (سكر)', 'مع زوجته في نفس الرحلة'];
const CANCEL_REASONS = ['إلغاء السفر', 'ظرف صحي', 'تعذر استخراج التأشيرة', 'طلب العميل', 'ظروف عائلية', 'تأجيل لرحلة لاحقة'];

// Trips: absolute dates around the 2026-10-18 anchor (historical, running, upcoming).
type TripPlan = { name: string; dep: string; ret: string; status: 'OPEN' | 'CLOSED' | 'COMPLETED'; base: number; weight: number; flight: 'DIRECT' | 'INDIRECT' };
const TRIPS: TripPlan[] = [
  { name: 'عمرة نوفمبر 2025', dep: '2025-11-08', ret: '2025-11-22', status: 'COMPLETED', base: 36000, weight: 1, flight: 'DIRECT' },
  { name: 'عمرة منتصف ديسمبر 2025', dep: '2025-12-14', ret: '2025-12-28', status: 'COMPLETED', base: 37000, weight: 1, flight: 'INDIRECT' },
  { name: 'عمرة رجب 1447', dep: '2025-12-25', ret: '2026-01-08', status: 'COMPLETED', base: 38500, weight: 1.6, flight: 'DIRECT' },
  { name: 'عمرة شعبان 1447', dep: '2026-01-24', ret: '2026-02-07', status: 'COMPLETED', base: 39000, weight: 1.4, flight: 'DIRECT' },
  { name: 'عمرة رمضان 1447', dep: '2026-02-20', ret: '2026-03-12', status: 'COMPLETED', base: 47000, weight: 2.2, flight: 'DIRECT' },
  { name: 'عمرة يوليو 2026', dep: '2026-07-15', ret: '2026-07-29', status: 'COMPLETED', base: 38000, weight: 0.8, flight: 'INDIRECT' },
  { name: 'عمرة المولد النبوي', dep: '2026-08-20', ret: '2026-09-03', status: 'COMPLETED', base: 39500, weight: 1.1, flight: 'DIRECT' },
  { name: 'عمرة سبتمبر 2026', dep: '2026-09-17', ret: '2026-10-01', status: 'CLOSED', base: 39000, weight: 0.9, flight: 'DIRECT' },
  { name: 'عمرة 10 أكتوبر', dep: '2026-10-10', ret: '2026-10-24', status: 'CLOSED', base: 40000, weight: 1.2, flight: 'DIRECT' },
  { name: 'عمرة 26 أكتوبر', dep: '2026-10-26', ret: '2026-11-09', status: 'CLOSED', base: 40000, weight: 2, flight: 'DIRECT' },
  { name: 'عمرة نوفمبر 2026', dep: '2026-11-12', ret: '2026-11-26', status: 'OPEN', base: 41000, weight: 1.5, flight: 'DIRECT' },
  { name: 'عمرة منتصف نوفمبر', dep: '2026-11-19', ret: '2026-12-03', status: 'OPEN', base: 40500, weight: 0.9, flight: 'INDIRECT' },
  { name: 'عمرة ديسمبر 2026', dep: '2026-12-05', ret: '2026-12-19', status: 'OPEN', base: 42000, weight: 1.3, flight: 'DIRECT' },
  { name: 'عمرة منتصف ديسمبر 2026', dep: '2026-12-16', ret: '2026-12-30', status: 'OPEN', base: 42500, weight: 1.1, flight: 'DIRECT' },
  { name: 'عمرة رجب 1448', dep: '2026-12-24', ret: '2027-01-07', status: 'OPEN', base: 43500, weight: 1.6, flight: 'DIRECT' },
  { name: 'عمرة شعبان 1448', dep: '2027-01-14', ret: '2027-01-28', status: 'OPEN', base: 44000, weight: 1.1, flight: 'INDIRECT' },
  { name: 'عمرة رمضان 1448', dep: '2027-02-10', ret: '2027-03-02', status: 'OPEN', base: 51000, weight: 2, flight: 'DIRECT' },
];

// ---------------------------------------------------------------- generators

let personSeq = 0;
const makePerson = () => {
  personSeq += 1;
  const female = chance(0.42);
  const first = female ? pick(FEMALE) : pick(MALE);
  const name = `${first} ${pick(MALE)} ${pick(MALE)} ${pick(FAMILY)}`;
  const year = int(1948, 2001);
  const month = int(1, 12);
  const dayOfMonth = int(1, 28);
  const birthDate = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const gov = pick(GOVERNORATES);
  const city = pick(gov.cities);
  // Fictional 14-digit Egyptian-style national ID: century, YYMMDD, governorate, sequence (gender digit), check.
  const genderDigit = female ? int(0, 4) * 2 : int(0, 4) * 2 + 1;
  const seq = String(personSeq % 1000).padStart(3, '0');
  const nationalId = `${year >= 2000 ? 3 : 2}${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}${String(dayOfMonth).padStart(2, '0')}${gov.code}${seq}${genderDigit}${int(1, 9)}`;
  const passportNumber = `A${String(26_000_000 + personSeq * 37).padStart(8, '0')}`;
  const address = chance(0.12) ? `${city} — ${gov.name}` : `${int(1, 120)} ${pick(STREETS)} — ${city} — ${gov.name}`;
  return {
    name,
    passportNumber,
    nationalId: chance(0.06) ? null : nationalId,
    birthDate,
    job: chance(0.08) ? null : female ? pick(JOBS_F) : year < 1962 && chance(0.5) ? 'متقاعد' : pick(JOBS_M),
    address: chance(0.04) ? null : address,
    notes: chance(0.08) ? pick(NOTES) : null,
  };
};
type Person = ReturnType<typeof makePerson>;

const phoneFor = (i: number) => `${pick(['010', '011', '012', '015'])}${String(10_000_000 + i * 7_919_311).slice(-8)}`;

// ---------------------------------------------------------------- main

const main = async () => {
  const { manager, employee, systemDelegate } = await guard();
  console.log(`demo seed → ${new URL(process.env.DATABASE_URL!).pathname.slice(1)} (uploads: ${UPLOADS_ROOT})`);
  writeSamples();
  const mgrActor = { id: manager.id, role: manager.role, fullName: manager.fullName };

  // Delegates: 12 given names + 18 generated; quotas give an uneven distribution.
  const delegateNames = [...DELEGATE_NAMES_GIVEN, ...DELEGATE_NAMES_GENERATED];
  const tierOf = (i: number) => (i % 6 === 0 ? 'big' : i % 2 === 0 ? 'mid' : 'small');
  const delegates = delegateNames.map((name, i) => {
    const tier = tierOf(i);
    const gov = pick(GOVERNORATES);
    return {
      id: crypto.randomUUID(),
      name,
      phone: phoneFor(i + 1),
      address: `${pick(gov.cities)} — ${gov.name}`,
      status: i === 29 ? ('INACTIVE' as const) : ('ACTIVE' as const),
      tier,
      quota: tier === 'big' ? int(60, 75) : tier === 'mid' ? int(30, 45) : int(10, 18),
      createdAt: addDays(day('2025-09-01'), i * 3),
    };
  });

  // Trips are opened for booking ~90 days ahead (never later than 20 days before the anchor).
  const trips = TRIPS.map((t) => {
    const departureDate = day(t.dep);
    return { ...t, id: crypto.randomUUID() as string, departureDate, returnDate: day(t.ret), createdAt: minDate(addDays(departureDate, -90), addDays(ANCHOR, -20)) };
  });
  const weightedTrip = (exclude: Set<string>) => {
    const pool = trips.filter((t) => !exclude.has(t.id));
    let r = rand() * pool.reduce((s, t) => s + t.weight, 0);
    for (const t of pool) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return pool[pool.length - 1]!;
  };

  // Assignments: every delegate in several trips, varied price per person.
  type Assignment = { id: string; delegateId: string; tripId: string; price: number; count: number };
  const assignments: Assignment[] = [];
  const priceFor = (base: number) => base + pick([-1500, -1000, -500, 0, 0, 500, 1000, 1500, 2500]);
  for (const d of delegates) {
    const k = d.tier === 'big' ? int(6, 9) : d.tier === 'mid' ? int(4, 6) : int(2, 3);
    const chosen = new Set<string>();
    while (chosen.size < k) chosen.add(weightedTrip(chosen).id);
    // Split the quota across the chosen trips (uneven, most get at least one).
    const ids = [...chosen];
    const weights = ids.map(() => 0.3 + rand());
    const totalW = weights.reduce((s, w) => s + w, 0);
    let left = d.quota;
    ids.forEach((tripId, idx) => {
      const trip = trips.find((t) => t.id === tripId)!;
      const count = idx === ids.length - 1 ? left : Math.min(left, Math.round((d.quota * weights[idx]!) / totalW));
      left -= count;
      assignments.push({ id: crypto.randomUUID(), delegateId: d.id, tripId, price: priceFor(trip.base), count });
    });
  }
  // Direct company customers (system delegate) in a few trips.
  for (const tripName of ['عمرة رمضان 1447', 'عمرة 26 أكتوبر', 'عمرة ديسمبر 2026', 'عمرة رمضان 1448', 'عمرة المولد النبوي']) {
    const trip = trips.find((t) => t.name === tripName)!;
    assignments.push({ id: crypto.randomUUID(), delegateId: systemDelegate.id, tripId: trip.id, price: trip.base + 2000, count: int(6, 11) });
  }

  // Pilgrims (+ a few returning pilgrims who travelled before).
  type PilgrimRow = Prisma.PilgrimCreateManyInput & { _docs: 'COMPLETE' | 'NO_PHOTO' | 'NO_PASSPORT' | 'NONE' };
  const pilgrims: PilgrimRow[] = [];
  const tripKeys = new Map<string, Set<string>>();
  const historical: Person[] = [];
  const tripById = new Map(trips.map((t) => [t.id, t]));
  for (const a of assignments) {
    const trip = tripById.get(a.tripId)!;
    const finished = trip.status === 'COMPLETED' || trip.returnDate < ANCHOR;
    const keys = tripKeys.get(trip.id) ?? new Set<string>();
    tripKeys.set(trip.id, keys);
    for (let i = 0; i < a.count; i += 1) {
      // Returning pilgrim: same person as in an earlier trip (allowed across trips).
      let person = !finished && historical.length > 20 && chance(0.05) ? pick(historical) : makePerson();
      if (keys.has(person.passportNumber) || (person.nationalId && keys.has(person.nationalId))) person = makePerson();
      keys.add(person.passportNumber);
      if (person.nationalId) keys.add(person.nationalId);
      if (finished) historical.push(person);

      // Booked between the trip opening and a few days before departure (never in the future).
      const windowEnd = minDate(addDays(trip.departureDate, -5), addDays(ANCHOR, -1));
      const span = Math.max(1, windowEnd.getTime() - trip.createdAt.getTime());
      const created = atHour(new Date(Date.UTC(1970, 0, 1) + Math.floor((trip.createdAt.getTime() + rand() * span) / 86_400_000) * 86_400_000), int(9, 16), int(0, 59));
      const cancelled = chance(0.05);
      const cancelledAt = cancelled ? atHour(minDate(addDays(created, int(2, 20)), addDays(ANCHOR, -1)), int(10, 17)) : null;
      const docs = finished
        ? pick(['COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE', 'NO_PHOTO', 'NO_PASSPORT', chance(0.4) ? 'NONE' : 'COMPLETE'] as const)
        : chance(0.84)
          ? 'COMPLETE'
          : 'NO_PHOTO';
      pilgrims.push({
        id: crypto.randomUUID(),
        ...person,
        delegateId: a.delegateId,
        tripId: trip.id,
        status: cancelled ? 'CANCELLED' : 'ACTIVE',
        cancelledAt,
        cancelledById: cancelled ? (chance(0.7) ? employee.id : manager.id) : null,
        cancelReason: cancelled ? pick(CANCEL_REASONS) : null,
        createdAt: created,
        _docs: docs,
      });
    }
  }

  // Transfers between two upcoming open trips of the same delegate (history kept).
  const transfers: Prisma.PilgrimTransferCreateManyInput[] = [];
  const openTrips = new Set(trips.filter((t) => t.status === 'OPEN').map((t) => t.id));
  let moved = 0;
  for (const d of shuffle(delegates)) {
    if (moved >= 10) break;
    const own = assignments.filter((a) => a.delegateId === d.id && openTrips.has(a.tripId));
    if (own.length < 2) continue;
    const [from, to] = own;
    const candidate = pilgrims.find(
      (p) => p.delegateId === d.id && p.tripId === from!.tripId && p.status === 'ACTIVE' && !tripKeys.get(to!.tripId)!.has(p.passportNumber),
    );
    if (!candidate) continue;
    tripKeys.get(to!.tripId)!.add(candidate.passportNumber);
    if (candidate.nationalId) tripKeys.get(to!.tripId)!.add(candidate.nationalId);
    candidate.tripId = to!.tripId;
    transfers.push({
      pilgrimId: candidate.id!,
      fromTripId: from!.tripId,
      toTripId: to!.tripId,
      reason: pick(['طلب المندوب', 'تغيير موعد السفر', null]),
      performedById: employee.id,
      createdAt: addDays(candidate.createdAt as Date, int(1, 6)),
    });
    moved += 1;
  }

  // Documents (hard-linked sample files).
  const documents: Prisma.PilgrimDocumentCreateManyInput[] = [];
  for (const p of pilgrims) {
    const types: Array<'PASSPORT_IMAGE' | 'PERSONAL_PHOTO'> =
      p._docs === 'COMPLETE' ? ['PASSPORT_IMAGE', 'PERSONAL_PHOTO'] : p._docs === 'NO_PHOTO' ? ['PASSPORT_IMAGE'] : p._docs === 'NO_PASSPORT' ? ['PERSONAL_PHOTO'] : [];
    for (const type of types) {
      const fileName = `${type}_${crypto.randomUUID()}.png`;
      const storageKey = path.join(p.id!, fileName);
      const { sizeBytes } = linkSample(type === 'PASSPORT_IMAGE' ? 'passport' : 'photo', storageKey);
      documents.push({
        pilgrimId: p.id!,
        type,
        fileName,
        originalName: type === 'PASSPORT_IMAGE' ? `جواز_${p.passportNumber}.png` : `صورة_شخصية_${int(100, 999)}.png`,
        mimeType: 'image/png',
        sizeBytes,
        storageKey,
        uploadedById: employee.id,
        createdAt: p.createdAt as Date,
      });
    }
  }

  // ---- bulk insert (one transaction)
  await prisma.$transaction(
    async (tx) => {
      await tx.delegate.createMany({ data: delegates.map(({ tier: _t, quota: _q, ...d }) => d) });
      await tx.trip.createMany({
        data: trips.map((t) => ({ id: t.id, name: t.name, departureDate: t.departureDate, returnDate: t.returnDate, flightType: t.flight, status: t.status, createdAt: t.createdAt })),
      });
      await tx.delegateTrip.createMany({
        data: assignments.map((a) => ({ id: a.id, delegateId: a.delegateId, tripId: a.tripId, pricePerPerson: money(a.price), createdAt: addDays(tripById.get(a.tripId)!.createdAt, 1) })),
      });
      for (let i = 0; i < pilgrims.length; i += 500) {
        await tx.pilgrim.createMany({ data: pilgrims.slice(i, i + 500).map(({ _docs: _d, ...p }) => p) });
      }
      for (let i = 0; i < documents.length; i += 1000) await tx.pilgrimDocument.createMany({ data: documents.slice(i, i + 1000) });
      if (transfers.length) await tx.pilgrimTransfer.createMany({ data: transfers });
    },
    { timeout: 120_000 },
  );
  console.log(`  delegates ${delegates.length} · trips ${trips.length} · assignments ${assignments.length} · pilgrims ${pilgrims.length} · documents ${documents.length} · transfers ${transfers.length}`);

  // ---- manager corrections (real service: rules + audit)
  const corrections: Array<[string, AdjustmentDirection, number, string]> = [
    [delegates[3]!.id, 'INCREASE', 1500, 'رسوم تأشيرة إضافية لمعتمرين'],
    [delegates[8]!.id, 'DECREASE', 1000, 'خصم متفق عليه لتأخر الإقامة'],
    [delegates[14]!.id, 'INCREASE', 3500, 'فرق غرفة فردية'],
    [delegates[20]!.id, 'DECREASE', 2000, 'تعويض عن تغيير الفندق'],
  ];
  for (const [delegateId, direction, amount, reason] of corrections) {
    await createCorrection(mgrActor, { delegateId, direction, amount: money(amount), reason });
  }

  // ---- payments: target a realistic mix of account states
  const accounts = await getDelegateAccounts([...delegates.map((d) => d.id), systemDelegate.id]);
  type Target = 'DUE' | 'SETTLED' | 'CREDIT';
  const targetOf = (i: number): Target => (i % 10 < 5 ? 'DUE' : i % 10 < 8 ? 'SETTLED' : 'CREDIT');
  let receiptNo = 24_000;
  const nextReceipt = () => {
    receiptNo += int(1, 3); // receipt books skip numbers (spoiled / other branches)
    return String(receiptNo);
  };
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const firstDate = new Map<string, Date>();
  for (const a of assignments) {
    const start = addDays(tripById.get(a.tripId)!.createdAt, 3);
    if (!firstDate.has(a.delegateId) || start < firstDate.get(a.delegateId)!) firstDate.set(a.delegateId, start);
  }
  const addPayment = (delegateId: string, amount: number, date: Date) => {
    const method = rand();
    const paymentMethod = method < 0.5 ? 'CASH' : 'TRANSFER';
    const transferType = method < 0.5 ? null : method < 0.8 ? 'INSTAPAY' : 'BANK_TRANSFER';
    const id = crypto.randomUUID();
    const receiptNumber = nextReceipt();
    const scanKey = path.join('payments', id, `RECEIPT_SCAN_${crypto.randomUUID()}.png`);
    const { sizeBytes } = linkSample('receipt', scanKey);
    payments.push({
      id,
      delegateId,
      amount: money(amount),
      receiptNumber,
      receiptKey: receiptKey(receiptNumber),
      receiptScanKey: scanKey,
      receiptScanMimeType: 'image/png',
      receiptScanOriginalName: `إيصال ${receiptNumber}.png`,
      receiptScanSizeBytes: sizeBytes,
      paymentMethod,
      transferType,
      referenceNumber: transferType === 'INSTAPAY' ? `IP${int(10_000_000, 99_999_999)}` : transferType === 'BANK_TRANSFER' ? `TRX-${int(100_000, 999_999)}` : null,
      paymentDate: date,
      notes: chance(0.06) ? pick(['دفعة مقدمة', 'باقي الحساب', 'دفعة عن رحلة رمضان']) : null,
      createdById: chance(0.85) ? employee.id : manager.id,
      createdAt: atHour(date, int(10, 18), int(0, 59)),
    });
    return id;
  };
  const allDelegates = [...delegates.map((d, i) => ({ id: d.id, target: targetOf(i) })), { id: systemDelegate.id, target: 'SETTLED' as Target }];
  for (const { id, target } of allDelegates) {
    const required = Math.round(Number(accounts.get(id)!.totalRequired));
    if (required <= 0) continue;
    const goal =
      target === 'SETTLED' ? required : target === 'CREDIT' ? required + int(2, 8) * 1000 : Math.round((required * (0.35 + rand() * 0.5)) / 1000) * 1000;
    const count = Math.max(1, Math.min(8, Math.round(goal / 45_000) + int(0, 2)));
    const end = addDays(ANCHOR, -1);
    const start = minDate(firstDate.get(id)!, addDays(end, -30));
    const dates = Array.from({ length: count }, () => new Date(start.getTime() + rand() * (end.getTime() - start.getTime())))
      .map((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())))
      .sort((x, y) => x.getTime() - y.getTime());
    let left = goal;
    dates.forEach((date, i) => {
      const amount = i === dates.length - 1 ? left : Math.max(500, Math.round((goal / count) * (0.6 + rand() * 0.8) / 500) * 500);
      const final = Math.min(amount, left);
      if (final > 0) addPayment(id, final, date);
      left -= final;
    });
  }
  // A few mistaken entries that a manager voids later (receipt numbers stay reserved).
  const mistaken = shuffle(delegates).slice(0, 6).map((d) => addPayment(d.id, int(2, 15) * 1000, addDays(ANCHOR, -int(3, 120))));
  for (let i = 0; i < payments.length; i += 500) await prisma.payment.createMany({ data: payments.slice(i, i + 500) });
  const VOID_REASONS = ['خطأ في المبلغ', 'تسجيل مكرر للإيصال', 'الإيصال يخص مندوباً آخر', 'خطأ في تاريخ الدفعة'];
  for (const paymentId of mistaken) await voidPayment(mgrActor, paymentId, pick(VOID_REASONS));

  // Refunds for some delegates with credit (limited to their credit by the service).
  const afterPayments = await getDelegateAccounts(delegates.map((d) => d.id));
  const credited = delegates.filter((d) => afterPayments.get(d.id)!.status === 'CREDIT');
  for (const [i, d] of credited.slice(0, 3).entries()) {
    const credit = Math.round(Number(afterPayments.get(d.id)!.credit));
    const amount = i === 0 ? credit : Math.max(500, Math.round(credit / 2 / 500) * 500);
    await createRefund(mgrActor, { delegateId: d.id, amount: money(amount), reason: i === 0 ? 'رد الرصيد الزائد للمندوب' : 'رد جزء من المبلغ الزائد', refundDate: addDays(ANCHOR, -int(2, 25)) });
  }

  // ---- company expenses (separate from delegate accounts)
  const expenses: Prisma.ExpenseCreateManyInput[] = [];
  const addExpense = (category: ExpenseCategory, amount: number, date: Date, description: string, opts: { transfer?: 'INSTAPAY' | 'BANK_TRANSFER'; attach?: boolean; notes?: string } = {}) => {
    if (date > ANCHOR) return null;
    const id = crypto.randomUUID();
    const attach = opts.attach ?? chance(0.3);
    const key = attach ? path.join('expenses', id, `INVOICE_${crypto.randomUUID()}.png`) : null;
    const size = key ? linkSample('invoice', key).sizeBytes : null;
    expenses.push({
      id,
      category,
      amount: money(amount),
      expenseDate: date,
      paymentMethod: opts.transfer ? 'TRANSFER' : 'CASH',
      transferType: opts.transfer ?? null,
      referenceNumber: opts.transfer ? `${opts.transfer === 'INSTAPAY' ? 'IP' : 'TRX-'}${int(100_000, 999_999)}` : null,
      description,
      notes: opts.notes ?? null,
      attachmentKey: key,
      attachmentOriginalName: key ? `فاتورة ${description}.png` : null,
      attachmentMimeType: key ? 'image/png' : null,
      attachmentSizeBytes: size,
      createdById: chance(0.8) ? employee.id : manager.id,
      createdAt: atHour(date, int(10, 17), int(0, 59)),
    });
    return id;
  };
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  for (let m = 0; m < 12; m += 1) {
    const monthStart = new Date(Date.UTC(2025, 10 + m, 1));
    const label = `${MONTHS[monthStart.getUTCMonth()]} ${monthStart.getUTCFullYear()}`;
    const on = (d: number) => addDays(monthStart, d - 1);
    addExpense('RENT', m < 8 ? 15000 : 16500, on(int(1, 5)), `إيجار المكتب — ${label}`, { transfer: 'BANK_TRANSFER', attach: true });
    addExpense('ELECTRICITY', int(18, 34) * 100, on(int(8, 14)), `فاتورة كهرباء — ${label}`, { attach: true });
    addExpense('INTERNET', 950, on(int(3, 7)), `اشتراك الإنترنت — ${label}`, { transfer: chance(0.6) ? 'INSTAPAY' : 'BANK_TRANSFER', attach: true });
    for (let i = int(1, 2); i > 0; i -= 1) addExpense('OFFICE_SUPPLIES', int(3, 36) * 50, on(int(1, 28)), pick(['ورق طباعة وأحبار', 'أدوات مكتبية', 'ملفات وحافظات', 'كارتريدج طابعة']));
    for (let i = int(0, 2); i > 0; i -= 1) addExpense('MAINTENANCE', int(3, 45) * 100, on(int(1, 28)), pick(['صيانة التكييف', 'صيانة الطابعة', 'سباكة وكهرباء المكتب', 'صيانة أجهزة الكمبيوتر']), { transfer: chance(0.2) ? 'INSTAPAY' : undefined });
    for (let i = int(3, 6); i > 0; i -= 1) addExpense('TRANSPORTATION', int(8, 90) * 10, on(int(1, 28)), pick(['مواصلات مشوار البنك', 'نقل جوازات للسفارة', 'توصيل مستندات للمطار', 'بنزين سيارة الشركة', 'مواصلات مندوب الشركة']));
    for (let i = int(3, 5); i > 0; i -= 1) addExpense('HOSPITALITY', int(12, 120) * 10, on(int(1, 28)), pick(['ضيافة زوار المكتب', 'بوفيه المكتب', 'ضيافة اجتماع المناديب', 'مياه وعصائر']));
    for (let i = int(0, 2); i > 0; i -= 1) addExpense('OTHER', int(2, 25) * 100, on(int(1, 28)), pick(['رسوم بنكية', 'طباعة لافتات', 'اشتراك برنامج محاسبة', 'رسوم بريد']), { transfer: chance(0.4) ? 'BANK_TRANSFER' : undefined });
  }
  await prisma.expense.createMany({ data: expenses });
  const toVoid = shuffle(expenses.filter((e) => e.category !== 'RENT')).slice(0, 5);
  for (const e of toVoid) await voidExpense({ id: manager.id, role: manager.role }, e.id!, pick(['تسجيل مكرر', 'المبلغ غير صحيح', 'مصروف شخصي سُجّل بالخطأ']));

  console.log(`  payments ${payments.length} (${mistaken.length} voided) · refunds ${Math.min(3, credited.length)} · corrections ${corrections.length} · expenses ${expenses.length} (${toVoid.length} voided)`);
  console.log(`  files: 4 sample images, ${linkedFiles.length} hard links under ${UPLOADS_ROOT}`);
  console.log('✔ demo seed completed');
};

main()
  .catch((error) => {
    console.error('✖ demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
