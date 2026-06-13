/**
 * One-time backfill: compute `sortDate` for existing Articles and Reports from
 * their human `date` string ("December 2025" -> 2025-12-01).
 *
 * New documents get sortDate automatically via the model pre-save hook; this
 * script only fixes records created before that field existed.
 *
 * Run once PER ENVIRONMENT DATABASE (dev / staging / prod). It is idempotent —
 * re-running it just recomputes the same values.
 *
 * Usage:
 *   node scripts/backfillSortDate.js
 *   ENV_FILE=.env.staging node scripts/backfillSortDate.js
 */

require('../config/loadEnv');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Article = require('../models/Article');
const Report = require('../models/Report');
const { parseMonthYearToDate } = require('../utils/parseContentDate');

const backfillCollection = async (Model, label) => {
  const docs = await Model.find();
  let updated = 0;
  let unparseable = 0;

  for (const doc of docs) {
    const computed = parseMonthYearToDate(doc.date);
    if (!computed) {
      unparseable += 1;
      console.warn(`   ⚠️  ${label} ${doc._id}: could not parse date "${doc.date}"`);
    }

    doc.sortDate = computed; // set even when null so the field exists
    await doc.save();
    updated += 1;
  }

  console.log(`✅ ${label}: processed ${updated}, unparseable ${unparseable}`);
};

(async () => {
  await connectDB();
  console.log('Backfilling sortDate...\n');

  await backfillCollection(Article, 'Articles');
  await backfillCollection(Report, 'Reports');

  await mongoose.disconnect();
  console.log('\n🎉 Backfill complete.');
})().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
