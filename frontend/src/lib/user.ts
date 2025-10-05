export function setUser(username: string): void {
  try {
    localStorage.setItem('username', username);
  } catch (err) {
    console.error('Failed to persist username', err);
  }
}

export function getUser(): string {
  let u = '';
  try {
    u = localStorage.getItem('username') || '';
  } catch (err) {
    console.error('Failed to read username', err);
  }
  if (!u) {
    try {
      const input = window.prompt('Bitte geben Sie Ihren Benutzernamen ein:') || '';
      if (input) {
        setUser(input);
        u = input;
      }
    } catch (err) {
      console.error('Username prompt failed', err);
    }
  }
  return u;
}
