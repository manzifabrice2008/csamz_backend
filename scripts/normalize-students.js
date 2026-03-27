require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const { normalizeTradeValue, normalizeLevelValue } = require('../utils/studentClassification');

async function run() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is not set');
  }

  await mongoose.connect(mongoUri);

  const students = await Student.find().lean();
  let updatedCount = 0;

  for (const student of students) {
    const normalizedTrade = normalizeTradeValue(student.trade);
    const normalizedLevel = normalizeLevelValue(student.level);

    if (normalizedTrade !== student.trade || normalizedLevel !== student.level) {
      await Student.updateOne(
        { _id: student._id },
        {
          $set: {
            trade: normalizedTrade,
            level: normalizedLevel,
          },
        }
      );
      updatedCount += 1;
    }
  }

  console.log(`Normalized ${updatedCount} student record(s).`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Failed to normalize students:', error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    // ignore disconnect errors on failure path
  }
  process.exit(1);
});
