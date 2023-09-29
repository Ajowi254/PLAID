const express = require("express");
const { getLoggedInUserId } = require("../utils");
const db = require("../db");
const { plaidClient } = require("../plaid");
const { setTimeout } = require("timers/promises");
const { SimpleTransaction } = require("../simpleTransactionObject");
const { Console } = require("console");
const { all } = require("./users");
const { Await } = require("react-router-dom");

const router = express.Router();

/**
 * This will ask our server to make a transactions sync call
 * against all the items it has for a particular user. This is one way
 * you can keep your transaction data up to date, but it's preferable
 * to just fetch data for a single item in response to a webhook.
 */
router.post("/sync", async (req, res, next) => {
  try {
   const userId = getLoggedInUserId(req);
   const items = await db.getItemIdsForUser(userId);
   items.forEach((item) => {
 syncTransactions(item.id);
   })
  } catch (error) {
    console.log(`Running into an error!`);
    next(error);
  }
});

const fetchNewSyncData = async function (accessToken, initialCursor){
  let keepGoing = false;
  const allData = { added:  [], modified: [], removed: [], nextCursor: initialCursor,
};
do {
  const results = await plaidClient.transactionsSync({
    access_token: accessToken,
    cursor: allData.nextCursor,
    options: {
    include_personal_finance_category: true,
  },
  });
const newData = results.data;
allData.added = allData.added.concat(newData.added);
allData.modified = allData.modified.concat(newData.modified);
allData.removed = allData.removed.concat(newData.removed);
allData.nextCursor = newData.next_cursor;
keepGoing = newData.has_more;
console.log(`Added: ${newData.added.length} Modified: ${newData.modified.length} Removed: ${newData.removed.length}`);


} while (keepGoing === true);

allData.modified.push({
  account_id: "USE_AN_EXISTING_ACCOUNT_ID",
  account_owner: null,
  amount: 6.33,
  authorized_date: "2021-03-23",
  authorized_datetime: null,
  category: ["Travel", "Taxi"],
  category_id: "22016000",
  check_number: null,
  date: "2021-03-24",
  datetime: null,
  iso_currency_code: "USD",
  merchant_name: "Uber",
  name: "Uber 072515 SF**POOL**",
  payment_channel: "online",
  pending: false,
  pending_transaction_id: null,
  personal_finance_category: {
    detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES",
    primary: "TRANSPORTATION",
  },
  transaction_code: null,
  transaction_id: "USE_AN_EXISTING_TRANSACTION_ID",
  transaction_type: "special",
  unofficial_currency_code: null,
});



console.log(`All done!`);
console.log(`Your final cursor: ${allData.nextCursor}`);
return allData;
};

/**
 * Given an item ID, this will fetch all transactions for all accounts
 * associated with this item using the sync API. We can call this manually
 * using the /sync endpoint above, or we can call this in response
 * to a webhook
 */
const syncTransactions = async function (itemId) {
  const summary = { added: 0, removed: 0, modified: 0 };
  const {access_token: accessToken, transaction_cursor: transactionCursor, user_id: userId,}=
   await db.getItemInfo(itemId);
  // 1.Fetch our most recent cursor from the database

  // 2. Fetch all our transactions since the last cursor
  const allData = await fetchNewSyncData(accessToken, transactionCursor); 

  // 3. Add new transactions to our database
    await Promise.all(allData.added.map(async (txnObj) => {
    const simpleTransaction = SimpleTransaction.fromPlaidTransaction(
        txnObj, 
        userId
        );
    //console.log(`I want to add ${JSON.stringify(simpleTransaction)}`);
    const result = await db.addNewTransaction(simpleTransaction)
   if (result) {
    summary.added += result.changes;
   }
    })
    );
  // 4.Updated any modified transactions
  await Promise.all(allData.modified.map(async (txnObj) => {
    const simpleTransaction = SimpleTransaction.fromPlaidTransaction(
        txnObj, 
        userId
        );
    //console.log(`I want to add ${JSON.stringify(simpleTransaction)}`);
    const result = await db.modifyExistingTransaction(simpleTransaction)
   if (result) {
    summary.modified += result.changes;
   }
    })
    );

  //5. Do something with removed transactions

  //6. Save our most recent cursor

  return summary;
  
  // TODO: Implement this!

};

/**
 * Fetch all the transactions for a particular user (up to a limit)
 * This is really just a simple database query, since our server has already
 * fetched these items using the syncTransactions call above
 *
 */
router.get("/list", async (req, res, next) => {
  try {
    res.json({ todo: "Implement this method" });
  } catch (error) {
    console.log(`Running into an error!`);
    next(error);
  }
});

module.exports = { router, syncTransactions };
