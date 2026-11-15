import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyAddedItem, assertOtherItemsUnchanged} from '../extension/cart.js';
const item = (id, signature = id) => ({id, signature, product: 'Hawaiian', quantity: 1});
test('adopts exactly one newly created row and preserves existing items', () => {
  assert.equal(identifyAddedItem([item('old')], [item('old'), item('new')]).id, 'new');
});
test('a merged or ambiguous item cannot be claimed as owned', () => {
  assert.throws(() => identifyAddedItem([item('old')], [item('old', 'quantity changed')]));
  assert.throws(() => identifyAddedItem([], [item('a'), item('b')]));
});
test('editing and cancelling own row leaves every other row intact', () => {
  assert.doesNotThrow(() => assertOtherItemsUnchanged([item('old'), item('own')], [item('old')], 'own'));
  assert.throws(() => assertOtherItemsUnchanged([item('old'), item('own')], [item('old', 'changed'), item('own')], 'own'));
});
