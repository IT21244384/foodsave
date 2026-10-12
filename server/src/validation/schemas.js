const { z } = require('zod');
const { CATEGORIES, DIET_TAGS, OFFER_TYPES, LISTING_STATUS } = require('../models/SurplusListing');

// Strict types reject operator objects such as {"$ne": null}, which blocks NoSQL injection.
const text = (min, max, label) =>
  z.string({ error: `${label} is required.` }).trim().min(min, `${label} must be at least ${min} characters.`).max(max, `${label} is too long.`);

const email = z.string({ error: 'Email is required.' }).trim().toLowerCase().email('Enter a valid email address.');
const password = z
  .string({ error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password is too long.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/[0-9]/, 'Password must contain a number.');
const phone = z.string({ error: 'Phone number is required.' }).trim().regex(/^\+?[0-9 ]{9,15}$/, 'Enter a valid phone number.');
const lat = z.coerce.number({ error: 'Latitude is required.' }).min(-90, 'Invalid latitude.').max(90, 'Invalid latitude.');
const lng = z.coerce.number({ error: 'Longitude is required.' }).min(-180, 'Invalid longitude.').max(180, 'Invalid longitude.');
const date = (label) => z.coerce.date({ error: `${label} is required.` }).refine((d) => !Number.isNaN(d.getTime()), `${label} is not a valid time.`);

const restaurantProfile = z.object({
  name: text(2, 100, 'Restaurant name'),
  address: text(5, 200, 'Address'),
  area: text(2, 60, 'Area'),
  phone,
  businessRegNo: text(3, 40, 'Business registration number'),
  lat,
  lng,
});

const register = z.discriminatedUnion('role', [
  z.object({ role: z.literal('customer'), name: text(2, 80, 'Name'), email, password, phone: phone.optional() }),
  z.object({ role: z.literal('restaurant'), name: text(2, 80, 'Name'), email, password, phone: phone.optional(), restaurant: restaurantProfile }),
], { error: 'Choose an account type.' });

const login = z.object({ email, password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(72) });

// Charity registration arrives as multipart form data, so every field is a string.
const charityRegister = z.object({
  name: text(2, 80, 'Your name'),
  email,
  password,
  orgName: text(2, 120, 'Organisation name'),
  regNo: text(3, 40, 'Registration number'),
  address: text(5, 200, 'Address'),
  area: text(2, 60, 'Area'),
  contactPerson: text(2, 80, 'Contact person'),
  phone,
  lat,
  lng,
});

const listing = z.object({
  item: text(2, 80, 'Item name'),
  category: z.enum(CATEGORIES, { error: 'Choose a category.' }),
  dietTags: z.array(z.enum(DIET_TAGS, { error: 'Unknown dietary tag.' })).max(4).default([]),
  quantity: z.coerce.number({ error: 'Quantity is required.' }).int('Quantity must be a whole number.').min(1, 'Quantity must be at least 1.').max(500, 'Quantity cannot exceed 500.'),
  originalPrice: z.coerce.number({ error: 'Original price is required.' }).min(0, 'Price cannot be negative.').max(100000, 'Price is too high.'),
  price: z.coerce.number().min(0, 'Price cannot be negative.').max(100000, 'Price is too high.').default(0),
  offerType: z.enum(OFFER_TYPES, { error: 'Choose sale or donation.' }),
  pickupFrom: date('Pickup start'),
  pickupTo: date('Pickup end'),
  safeUntil: date('Safe-until time'),
  hygieneDeclared: z.boolean({ error: 'Tick the hygiene declaration to publish.' }),
});

const myListingsQuery = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum([...LISTING_STATUS, 'all']).default('all'),
  range: z.enum(['today', 'week', 'month', 'all']).default('all'),
});

const nearbyQuery = z.object({
  lat,
  lng,
  km: z.coerce.number().min(0.5, 'Distance must be at least 0.5 km.').max(25, 'Distance cannot exceed 25 km.').default(5),
  diet: z.enum(DIET_TAGS).optional(),
  maxPrice: z.coerce.number().min(0).max(100000).optional(),
  offer: z.enum([...OFFER_TYPES, 'all']).default('all'),
  minLeft: z.coerce.number().int().min(0).max(720).default(0), // minutes of safe time left
});

const review = z
  .object({ decision: z.enum(['approved', 'rejected'], { error: 'Decision must be approved or rejected.' }), reason: z.string().trim().max(300).optional() })
  .refine((v) => v.decision === 'approved' || (v.reason && v.reason.length >= 5), { message: 'Give a reason of at least 5 characters when rejecting.', path: ['reason'] });

module.exports = { register, login, charityRegister, restaurantProfile, listing, myListingsQuery, nearbyQuery, review };
