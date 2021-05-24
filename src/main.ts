import * as stream from 'stream';
import * as util from 'util';
import * as _ from 'lodash';
import * as db from 'mongodb';

const pipeline = util.promisify(stream.pipeline);

function doSomethingFunction(data: any): any {
  return data;
}

function getDataFunction(cursor: any): any {
  return cursor;
}

/**
 * Function that starts the program.
 */
async function run(): Promise<void> {
  const connectionURI = process.env.MONGODB_URI as string;
  const dbConn = await db.connect(connectionURI);
  const collection = process.env.MONGO_COLLECTION as string;
  const dbo = dbConn.db('db');
  const dbCollection = dbo.collection(collection);
  const cursor = dbCollection.find({})
  let previousCount: number = 0;
  let numItemsProcessed: number = 0;
  const statsInterval = setInterval(
    () => {
      const listingsSpeed = (numItemsProcessed - previousCount) / 10;
      previousCount = numItemsProcessed;
      const logs = [
        `Listings found: ${numItemsProcessed} (${listingsSpeed.toFixed(2)} listings/s)`
      ];
      console.log(logs.join(' - '));
    },
    10000,
  );
  await pipeline(
    getDataFunction(cursor),
    new stream.Transform({
      objectMode: true,
      transform: async (data: any, _0, cb) => {
        try {
          const listings = await doSomethingFunction(data);
          numItemsProcessed += listings.length;
          cb(undefined, listings);
        } catch (e) {
          cb(e);
        }
      },
    }),
    new stream.Transform({
      objectMode: true,
      transform: async (data: any, _0, cb) => {
        try {
          // Avoid duplicates when inserting
          await dbCollection.insertMany(data, { ordered: false },
          );
          cb();
        } catch (err) {
          try {
            const result: db.BulkWriteResult = err.result;
            const writeErrors: db.WriteError[] = result.getWriteErrors() as db.WriteError[];
            const errorCodes: number[] = writeErrors.map(we => we.code);
            if (!errorCodes.length) return cb(err); // Consider empty error codes as non-sense
            const duplicatedKeyCode = 11000;
            const unexpectedCodeIndex = errorCodes.findIndex(code => code !== duplicatedKeyCode);
            if (unexpectedCodeIndex >= 0) {
              return cb(err);
            }
            return cb(); // Ignore unique key errors
          } catch (innerErr) {
            return cb(innerErr);
          }
        }
      },
    }),
  );
  await dbConn.close();
  console.log(`Total items processed: ${numItemsProcessed}`);
  clearInterval(statsInterval);
}

run()
  .then(() => {
    console.error('[OK]');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
