'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const config = require('../config');
const invoice = require('../lib/invoice');
const ordersRouter = require('../routes/orders');
const pricing = require('../lib/pricing');
const store = require('../lib/store');

const createOrderHandler = ordersRouter.stack.find(function (layer) {
  return layer.route && layer.route.path === '/orders' && layer.route.methods.post;
}).route.stack[0].handle;

function makeDb() {
  return {
    products: [{
      id: 1,
      sku: 'RICE-1',
      name: 'Rice',
      hsn: '1006',
      price: 100,
      stock: 20,
      reserved: 0
    }],
    orders: [],
    customers: [],
    auditLog: [],
    nextOrderId: 1001
  };
}

function postInMemoryOrder(db) {
  const response = {
    statusCode: 200,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (body) {
      this.body = body;
      return this;
    }
  };

  createOrderHandler({
    body: {
      items: [{ id: 1, qty: 1 }],
      paymentMode: 'cash'
    }
  }, response);

  return response;
}

test('CURRENT BEHAVIOUR: checkout applies the configured HSN rate to the bill', function () {
  const totals = pricing.computeTotals([
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }
  ], '');

  assert.equal(totals.tax, 5);
  assert.equal(totals.total, 105);
});

test('invoice keeps the GST rate from order placement after configuration changes', function () {
  const priorRate = config.tax.hsnSlabs['1006'];
  const priorRead = store.read;
  const priorWrite = store.write;
  const db = makeDb();

  try {
    config.tax.hsnSlabs['1006'] = 5;
    store.read = function () { return db; };
    store.write = function () {};

    const response = postInMemoryOrder(db);
    assert.equal(response.statusCode, 201);

    config.tax.hsnSlabs['1006'] = 18;
    const figures = invoice.computeInvoiceFigures(response.body);

    assert.equal(figures.rows[0].gstPercent, 5);
    assert.equal(figures.rows[0].lineTax, 5);
    assert.equal(figures.tax, 5);
    assert.equal(figures.total, 105);
    assert.equal(response.body.items[0].gstRate, 5);
  } finally {
    store.read = priorRead;
    store.write = priorWrite;
    config.tax.hsnSlabs['1006'] = priorRate;
  }
});
