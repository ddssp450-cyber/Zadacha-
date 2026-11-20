// Bulgarian numbers: +359 or 0, then 8–9 digits (mobile 8X XXX XXXX, landline e.g. 2 XXX XXXX). Spaces, dashes, brackets ignored.
export const isValidPhone = (phone: string) => /^(\+359|0)[1-9]\d{7,8}$/.test(phone.replace(/[\s\-()]/g, ''));

console.assert(isValidPhone('+359 88 123 4567') && isValidPhone('0888123456') && isValidPhone('02 987 6543'));
console.assert(!isValidPhone('12345') && !isValidPhone('+359 0888 123 456') && !isValidPhone('+1 555 123 4567'));
