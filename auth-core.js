export function validateAccount({mode, email='', password='', confirmation=''}) {
  if (!['new-password','invite'].includes(mode) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'email';
  if (mode === 'recover') return null;
  if (!password || password.length > 128 || (mode !== 'login' && password.length < 12)) return 'password';
  if (mode !== 'login' && password !== confirmation) return 'confirmation';
  return null;
}

export function authErrorCode(error) {
  const message=String(error?.message||'').toLowerCase();
  if (error?.status===429 || /rate.limit|too many/.test(message)) return 'limit';
  if (/not confirmed|confirm your email/.test(message)) return 'unconfirmed';
  if (/invalid login|invalid credentials|invalid_grant/.test(message)) return 'credentials';
  if (/expired|invalid.*token|token.*invalid/.test(message)) return 'expired';
  if (/already.*registered|already.*exists/.test(message)) return 'existing';
  return 'unavailable';
}
