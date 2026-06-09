import { prisma } from "../src/services/prisma";

const INDEX_NAME = "PaymentInvoice_payId_key";

type PaymentInvoicePayIdSample = {
  _id?: unknown;
  payId?: unknown;
  status?: unknown;
};

type MongoCursorResult<T> = {
  cursor?: {
    firstBatch?: T[];
  };
};

function isMongoIndexMissingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("index not found") || message.includes("IndexNotFound");
}

async function command<T>(payload: object) {
  return (await prisma.$runCommandRaw(payload)) as T;
}

async function findPayIdSamples() {
  const result = await command<MongoCursorResult<PaymentInvoicePayIdSample>>({
    find: "PaymentInvoice",
    projection: { payId: 1, status: 1 },
    limit: 100,
  });
  return result.cursor?.firstBatch ?? [];
}

async function aggregateDuplicatePayIds() {
  const result = await command<MongoCursorResult<{ _id: unknown; count: number; ids: unknown[] }>>({
    aggregate: "PaymentInvoice",
    pipeline: [
      { $match: { payId: { $exists: true, $nin: [null, ""] } } },
      { $group: { _id: "$payId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 100 },
    ],
    cursor: {},
  });
  return result.cursor?.firstBatch ?? [];
}

async function main() {
  console.log("PaymentInvoice payId sample before fix:");
  for (const sample of await findPayIdSamples()) {
    console.log(JSON.stringify(sample));
  }

  const duplicatePayIds = await aggregateDuplicatePayIds();
  if (duplicatePayIds.length > 0) {
    console.error("Duplicate non-empty payId values exist. Resolve these manually before creating a unique partial index:");
    for (const duplicate of duplicatePayIds) console.error(JSON.stringify(duplicate));
    process.exitCode = 1;
    return;
  }

  const cleanup = await command<{ n: number; nModified: number }>({
    update: "PaymentInvoice",
    updates: [
      {
        q: { $or: [{ payId: null }, { payId: "" }, { payId: { $type: "undefined" } }] },
        u: { $unset: { payId: "" } },
        multi: true,
      },
    ],
  });
  console.log(`Unset legacy blank/null/undefined payId values on ${cleanup.nModified ?? cleanup.n ?? 0} document(s).`);

  try {
    await command({ dropIndexes: "PaymentInvoice", index: INDEX_NAME });
    console.log(`Dropped existing ${INDEX_NAME} index.`);
  } catch (error) {
    if (!isMongoIndexMissingError(error)) throw error;
    console.log(`${INDEX_NAME} index did not exist; continuing.`);
  }

  await command({
    createIndexes: "PaymentInvoice",
    indexes: [
      {
        key: { payId: 1 },
        name: INDEX_NAME,
        unique: true,
        partialFilterExpression: { payId: { $exists: true, $type: "string", $ne: "" } },
      },
    ],
  });
  console.log(`Created ${INDEX_NAME} as a partial unique index for non-empty string payId values only.`);

  console.log("PaymentInvoice payId sample after fix:");
  for (const sample of await findPayIdSamples()) {
    console.log(JSON.stringify(sample));
  }

  const missingPayIdCount = await command<MongoCursorResult<{ count: number }>>({
    aggregate: "PaymentInvoice",
    pipeline: [{ $match: { payId: { $exists: false } } }, { $count: "count" }],
    cursor: {},
  });
  console.log(`Documents with no payId field: ${missingPayIdCount.cursor?.firstBatch?.[0]?.count ?? 0}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
