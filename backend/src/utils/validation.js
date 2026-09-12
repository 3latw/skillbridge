const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const email = value => text(value, 150) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const phone = value => typeof value === 'string' && /^(\+962|0)7[789]\d{7}$/.test(value);
const password = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
module.exports = { text, email, phone, password };
