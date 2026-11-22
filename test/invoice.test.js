'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

function mixedHsnItems() {
  return [
    { id: 1, name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 100, qty: 1 },
    { id: 2, name: 'Tea', sku: 'TEA-1', hsn: '0902', price: 100, qty: 1 }
  ];
}

function orderFromCheckout(items, coupon) {
  const totals = pricing.computeTotals(items, coupon);
  return {
    id: 501,
    date: '22/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items,
    coupon,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: checkout applies the coupon before HSN-specific GST', function () {
  const totals = pricing.computeTotals(mixedHsnItems(), 'WELCOME');

  assert.deepEqual(totals, {
    subtotal: 200,
    discount: 10,
    taxable: 190,
    tax: 21.85,
    cgst: 10.93,
    sgst: 10.92,
    total: 211.85,
    lines: [
      {
        id: 1,
        name: 'Rice',
        hsn: '1006',
        gstPercent: 5,
        gross: 100,
        discount: 5,
        taxable: 95,
        tax: 4.75,
        net: 99.75
      },
      {
        id: 2,
        name: 'Tea',
        hsn: '0902',
        gstPercent: 18,
        gross: 100,
        discount: 5,
        taxable: 95,
        tax: 17.1,
        net: 112.1
      }
    ]
  });
});

test('invoice reproduces checkout HSN tax and post-discount calculation', function () {
  const items = mixedHsnItems();
  const billed = pricing.computeTotals(items, 'WELCOME');
  const figures = invoice.computeInvoiceFigures({ items, coupon: 'WELCOME' });

  assert.deepEqual(
    {
      subtotal: figures.subtotal,
      discount: figures.discount,
      tax: figures.tax,
      cgst: figures.cgst,
      sgst: figures.sgst,
      total: figures.total
    },
    {
      subtotal: billed.subtotal,
      discount: billed.discount,
      tax: billed.tax,
      cgst: billed.cgst,
      sgst: billed.sgst,
      total: billed.total
    }
  );
  assert.deepEqual(figures.rows.map(function (row) { return row.gstPercent; }), [5, 18]);
  assert.deepEqual(figures.rows.map(function (row) { return row.lineTax; }), [4.75, 17.1]);
});

test('invoice follows checkout SAVE10 cap and taxable amount', function () {
  const items = [
    { id: 3, name: 'Packaged tea', sku: 'TEA-2', hsn: '0902', price: 2000, qty: 1 }
  ];
  const billed = pricing.computeTotals(items, 'SAVE10');
  const invoiceFigures = invoice.computeInvoiceFigures({ items, coupon: 'SAVE10' });

  assert.deepEqual(
    { discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 150, tax: 333, total: 2183 }
  );
  assert.deepEqual(
    {
      discount: invoiceFigures.discount,
      tax: invoiceFigures.tax,
      total: invoiceFigures.total
    },
    { discount: billed.discount, tax: billed.tax, total: billed.total }
  );
});

test('invoice preserves saved bill figures after a coupon expires', function () {
  const items = [
    { id: 4, name: 'Packaged tea', sku: 'TEA-3', hsn: '0902', price: 1000, qty: 1 }
  ];
  const figures = invoice.computeInvoiceFigures({
    items,
    coupon: 'DIWALI20',
    subtotal: 1000,
    discount: 200,
    tax: 144,
    total: 944
  });

  assert.deepEqual(
    {
      subtotal: figures.subtotal,
      discount: figures.discount,
      tax: figures.tax,
      total: figures.total,
      lineTax: figures.rows[0].lineTax
    },
    { subtotal: 1000, discount: 200, tax: 144, total: 944, lineTax: 144 }
  );
});

test('rendered invoice shows billed totals and GST without a mismatch notice', function () {
  const order = orderFromCheckout(mixedHsnItems(), 'WELCOME');
  const html = invoice.render(order);

  assert.match(html, /Invoice Total<\/td><td class="r">₹211\.85/);
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹21\.85/);
  assert.match(html, /<td class="r">₹4\.75<\/td>/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('GST reconciliation matches the in-memory order and invoice', function () {
  const order = orderFromCheckout(mixedHsnItems(), 'WELCOME');
  const result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].ledgerTax, 21.85);
  assert.equal(result.rows[0].invoiceTax, 21.85);
  assert.equal(result.rows[0].ledgerTotal, 211.85);
  assert.equal(result.rows[0].invoiceTotal, 211.85);
  assert.equal(result.rows[0].matched, true);
});
