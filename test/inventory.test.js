'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

test('inventory accepts exactly the remaining sellable quantity', function () {
  const products = [
    { id: 1, name: 'A2 Ghee', stock: 1, reserved: 0 },
    { id: 2, name: 'Byadgi Chilli Powder', stock: 4, reserved: 3 }
  ];

  assert.deepEqual(inventory.check(products, [
    { id: 1, qty: 1 },
    { id: 2, qty: 1 }
  ]), { ok: true });

  assert.deepEqual(inventory.check(products, [{ id: 1, qty: 2 }]), {
    ok: false,
    msg: 'A2 Ghee is out of stock (1 sellable available)'
  });
});

test('cancelling an order restores physical stock without releasing quote reservations', function () {
  const db = {
    orders: [{
      id: 1007,
      status: 'pending',
      paymentMode: 'cash',
      items: [{ id: 1, qty: 1 }]
    }],
    products: [{ id: 1, name: 'Chilli Powder', stock: 3, reserved: 3 }]
  };

  const result = orders.cancel(db, 1007, 'test cancellation');

  assert.equal(result.ok, true);
  assert.equal(result.order.status, 'cancelled');
  assert.equal(db.products[0].stock, 4);
  assert.equal(db.products[0].reserved, 3);
});

test('releasing a quote reservation still reduces reserved units only', function () {
  const products = [{ id: 3, stock: 10, reserved: 2 }];

  inventory.release(products, [{ productId: 3, qty: 2 }]);

  assert.equal(products[0].stock, 10);
  assert.equal(products[0].reserved, 0);
});
