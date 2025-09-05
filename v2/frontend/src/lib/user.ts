export function getUser(): string {
  let u = '';
  try {
    u = localStorage.getItem('username') || '';
  } catch (err) {
    console.error('Failed to read username', err);
  }
  if (!u) {
    try {
      u = window.prompt('Bitte geben Sie Ihren Benutzernamen ein:') || '';
      if (u) localStorage.setItem('username', u);
    } catch (err) {
      console.error('Username prompt failed', err);
    }
  }
  return u;
}
