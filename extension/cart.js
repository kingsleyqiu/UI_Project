function uniqueRows(cart) {
  if (!Array.isArray(cart) || cart.some(row => !row.id || !row.signature) || new Set(cart.map(row => row.id)).size !== cart.length) {
    throw new Error('The cart items cannot be identified uniquely. Please review the cart manually.');
  }
}

export function assertOtherItemsUnchanged(before, after, managedId = null) {
  uniqueRows(before);
  uniqueRows(after);
  const previous = before.filter(row => row.id !== managedId);
  const current = after.filter(row => row.id !== managedId);
  if (previous.length !== current.length || previous.some(row => !current.some(next => next.id === row.id && next.signature === row.signature))) {
    throw new Error('Other cart items changed. I have paused; please review the whole cart before continuing.');
  }
}

export function identifyAddedItem(before, after) {
  uniqueRows(before);
  uniqueRows(after);
  const added = after.filter(row => !before.some(old => old.id === row.id));
  if (added.length !== 1) throw new Error('The website may have combined cart items. I cannot safely identify this session\'s pizza. Please take over manually.');
  assertOtherItemsUnchanged(before, after.filter(row => row.id !== added[0].id));
  return added[0];
}
