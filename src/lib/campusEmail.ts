// Only Polinema student accounts may register or sign in:  <12-digit NIM>@student.polinema.ac.id
export const CAMPUS_EMAIL_DOMAIN = 'student.polinema.ac.id';
export const CAMPUS_EMAIL_ERROR = 'Please use your student email in the format NIM@student.polinema.ac.id.';

export function normalizeCampusEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

export function isCampusStudentEmail(email: string): boolean {
  return /^[0-9]{12}@student\.polinema\.ac\.id$/.test(normalizeCampusEmail(email));
}

export function campusEmailNim(email: string): string | null {
  const e = normalizeCampusEmail(email);
  return isCampusStudentEmail(e) ? e.split('@')[0] : null;
}
