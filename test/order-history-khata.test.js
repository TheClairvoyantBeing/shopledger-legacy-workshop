'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const orders = require('../lib/orders');
const ledger = require('../lib/ledger');

function sampleOrders() {
  return [
    { id: 1008, date: '15/03/2022' },
    { id: 1004, date: '30/01/2022' },
    { id: 1001, date: '28/12/2021' }
  ];
}

function customerDb() {
  return {
    nextSettlementId: 1,
    settlements: [],
    customers: [{
      id: 7,
      name: 'Meera Joshi',
      openingBalance: 0,
      totalBilled: 2432.01,
      totalSettled: 1200
    }]
  };
}

test('order history sorts newest first by calendar date', function () {
  assert.deepEqual(orders.list({ orders: sampleOrders() }, {}).map(function (o) { return o.id; }), [
    1008,
    1004,
    1001
  ]);
});

test('order history date range includes only matching calendar dates', function () {
  const found = orders.list({ orders: sampleOrders() }, {
    from: '2022-03-01',
    to: '2022-03-31'
  });

  assert.deepEqual(found.map(function (o) { return o.id; }), [1008]);
});

test('string settlement amounts update Khata totals numerically', function () {
  const db = customerDb();
  const result = ledger.recordSettlement(db, 7, '500', 'upi', 'monthly payment');

  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(result.settlement.amount, 500);
});
