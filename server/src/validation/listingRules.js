// FR1.3 – business rules for a surplus listing. Pure function so it can be unit-tested on its own.
// Returns an object of { field: message }; empty means the listing is valid.
function checkListingRules(data, now = new Date(), { maxHoldHoursCooked = 6 } = {}) {
  const errors = {};
  const from = new Date(data.pickupFrom);
  const to = new Date(data.pickupTo);
  const safe = new Date(data.safeUntil);

  if (to <= from) errors.pickupTo = 'Pickup end must be after pickup start.';
  else if (to <= now) errors.pickupTo = 'The pickup window has already ended.';

  if (safe <= to) errors.safeUntil = 'Safe-until must be after the pickup window ends.';
  else if (data.category === 'Cooked' && safe - now > maxHoldHoursCooked * 3600 * 1000) {
    errors.safeUntil = `Cooked food can be held for at most ${maxHoldHoursCooked} hours from now.`;
  }

  if (data.offerType === 'sale') {
    if (!(data.price > 0)) errors.price = 'Enter a discounted price.';
    else if (data.price >= data.originalPrice) errors.price = 'Discounted price must be lower than the original price.';
  }

  if (data.hygieneDeclared !== true) errors.hygieneDeclared = 'Tick the hygiene declaration to publish.';

  return errors;
}

module.exports = { checkListingRules };
